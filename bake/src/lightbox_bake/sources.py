"""Where baked photos come from: the cortex tape (real) or the synthetic fixture.

Both produce :class:`SourceRecord`s, so the index builder never knows which it
is reading. The tape reader queries the documented lineage schema directly (the
same ``source_asset`` ⋈ ``caption`` join lens's replay backend uses) and pulls
image bytes from the cortex blob store by sha256, falling back to a local
``uri``.
"""

from __future__ import annotations

import html
import os
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


@dataclass
class SourceRecord:
    """One captioned image, as recorded."""

    uri: str
    caption: dict[str, Any]  # CaptionResult-shaped: final_caption, caption_variants, raw_tags, raw_prose, ...
    load_bytes: Callable[[], bytes | None]
    sha256: str | None = None
    provenance: dict[str, Any] = field(default_factory=dict)


# Latest caption per asset; optionally restricted to one curated dataset.
_TAPE_SQL = """
    SELECT DISTINCT ON (a.id)
           a.uri, a.sha256, a.metadata,
           c.final_caption, c.variants, c.raw_tags, c.raw_prose,
           c.backend, c.profile, c.version, c.metadata
    FROM source_asset a
    JOIN caption c ON c.asset_id = a.id
    {where}
    ORDER BY a.id, c.version DESC, c.created_at DESC
"""

# Provenance keys worth showing (quarry records licence/source/author on the asset).
_PROVENANCE_KEYS = ("license", "license_url", "source", "source_url", "author", "author_url", "title", "dataset")
# argus-quarry writes British "licence" and "attribution"; map them onto the keys the web app reads.
_PROVENANCE_ALIASES = {"licence": "license", "licence_url": "license_url", "attribution": "author"}


def _provenance(asset_meta: dict[str, Any] | None, uri: str) -> dict[str, Any]:
    meta = dict(asset_meta or {})
    for alias, key in _PROVENANCE_ALIASES.items():
        if meta.get(alias) and not meta.get(key):
            meta[key] = meta[alias]
    if not meta.get("source_url") and urlparse(uri).scheme in ("http", "https"):
        meta["source_url"] = uri  # e.g. the Wikimedia Commons file page quarry fetched it from
    # Commons attribution strings arrive HTML-escaped ("EN NOIR &amp; BLANC"); React escapes again.
    return {k: html.unescape(v) if isinstance(v, str) else v for k in _PROVENANCE_KEYS if (v := meta.get(k))}


def refine_record(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Keep the rewrite lens recorded, whether it arrived on the wire or from our cache.

    A checked rewrite changes ``final_caption`` after assembly. The explain view
    needs that fact so the difference is not reported as ``drift``.
    """
    raw = payload.get("refine")
    if not isinstance(raw, dict):
        metadata = payload.get("metadata")
        raw = metadata.get("refine") if isinstance(metadata, dict) else None
    if not isinstance(raw, dict):
        return None
    record: dict[str, Any] = {}
    model = raw.get("model")
    if isinstance(model, str) and model:
        record["model"] = model
    accepted = raw.get("accepted")
    if isinstance(accepted, list):
        names = [item for item in accepted if isinstance(item, str) and item]
        if names:
            record["accepted"] = names
    skipped = raw.get("skipped")
    if isinstance(skipped, str) and skipped:
        record["skipped"] = skipped
    return record or None


def _local_path(uri: str) -> Path | None:
    parsed = urlparse(uri)
    if parsed.scheme in ("", "file"):
        path = Path(parsed.path if parsed.scheme else uri)
        return path if path.is_file() else None
    return None


def tape_records(pg_url: str, *, dataset: str | None = None, limit: int | None = None) -> Iterator[SourceRecord]:
    """Yield the latest recorded caption for every asset in the cortex lineage store."""
    try:
        import psycopg
        from argus_cortex.store import open_blob_store
    except ImportError as exc:  # pragma: no cover - exercised only without the extra
        raise SystemExit("reading the tape needs the [tape] extra: uv pip install -e 'bake[tape]'") from exc

    blobs = open_blob_store()  # no-op store when CORTEX_S3_* is unset; then local uris are the only source
    where, params = "", []
    if dataset:
        where = "WHERE c.id IN (SELECT caption_id FROM dataset_membership WHERE dataset = %s)"
        params.append(dataset)
    sql = _TAPE_SQL.format(where=where) + (f" LIMIT {int(limit)}" if limit else "")

    with psycopg.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    for uri, sha256, asset_meta, final, variants, raw_tags, raw_prose, backend, profile, version, caption_meta in rows:

        def load(sha256=sha256, uri=uri) -> bytes | None:
            if sha256 and (data := blobs.get(sha256)) is not None:
                return data
            path = _local_path(uri)
            return path.read_bytes() if path else None

        profile = profile or {}
        caption: dict[str, Any] = {
            "final_caption": final,
            "caption_variants": variants or {},
            "selected_category": profile.get("target_category", "identity"),
            "raw_tags": raw_tags or "",
            "raw_prose": raw_prose or "",
            "backend_name": backend or "",
            "profile": profile,
            "version": version,
        }
        # Lens records a checked rewrite in CaptionResult.metadata["refine"]; cortex keeps it in caption.metadata.
        if (refine := refine_record({"metadata": caption_meta})) is not None:
            caption["refine"] = refine
        yield SourceRecord(
            uri=uri,
            sha256=sha256,
            provenance=_provenance(asset_meta, uri),
            load_bytes=load,
            caption=caption,
        )


def default_pg_url() -> str | None:
    """The lineage store URL, from the same env var cortex and lens's replay backend read."""
    return os.environ.get("CORTEX_PG_URL")
