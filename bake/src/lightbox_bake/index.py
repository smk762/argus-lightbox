"""Assemble ``index.json`` — the static data contract the web app reads.

Shape (``version`` 1.x)::

    {
      "version": "1.0", "generated_at": ISO-8601, "source": "fixture" | "tape" | "folder",
      "lens_version": "0.7.0", "categories": ["identity", ...],
      "queue": 12,   # optional; folder bakes only. Images not yet captioned. 0 when the bake finished.
      "photos": [{
        "id", "sha256", "image", "thumb", "xmp", "width", "height", "color",
        "caption":  CaptionResult fields (final_caption, caption_variants, raw_tags, raw_prose,
                    backend_name, selected_category) + profile, version   # as recorded
        "explain":  {buckets, compaction_notes, subjects, drift},          # recomposed
        "compare":  {tags|prose|hybrid: {final_caption, caption_variants}} # when both raw outputs exist
        "facets":   {category: [terms], "people": [...]},
        "exif":     display-ready EXIF (never GPS),
        "provenance": {license, source, author, ...}
      }]
    }

``caption`` keeps lens's wire field names so a live lens ``/caption`` response
can be dropped into the same shape.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import argus_lens
from argus_lens.connectors.xmp import XmpSink

from lightbox_bake import INDEX_VERSION
from lightbox_bake.explain import CATEGORIES, explain
from lightbox_bake.images import render
from lightbox_bake.sources import SourceRecord


@dataclass
class BakeStats:
    """Counts reported at the end of a bake."""

    baked: int = 0
    skipped: list[str] = field(default_factory=list)
    drifted: int = 0


def build_index(records: Iterable[SourceRecord], out_dir: Path, *, source: str) -> BakeStats:
    """Render every record's images into *out_dir* and write ``index.json`` beside them."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stats = BakeStats()
    photos: list[dict] = []
    seen: set[str] = set()
    for record in records:
        photo, reason = render_photo(record, out_dir)
        if photo is None or reason is not None:
            stats.skipped.append(reason or f"{record.uri}: skipped")
            continue
        if photo["id"] in seen:
            stats.skipped.append(f"{record.uri}: duplicate of {photo['id']}")
            continue
        seen.add(photo["id"])
        stats.drifted += bool(photo["explain"]["drift"])
        photos.append(photo)
        stats.baked += 1

    _prune(out_dir, seen)
    write_gallery(out_dir, photos, source=source)
    return stats


def read_photos(out_dir: Path) -> list[dict]:
    """Photos already written to ``index.json``, or an empty list."""
    path = out_dir / "index.json"
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    photos = payload.get("photos") if isinstance(payload, dict) else None
    return (
        [photo for photo in photos if isinstance(photo, dict) and photo.get("id")] if isinstance(photos, list) else []
    )


def render_photo(record: SourceRecord, out_dir: Path) -> tuple[dict | None, str | None]:
    """Render one record. ``(photo, None)`` on success, ``(None, reason)`` when it cannot be shown."""
    raw = record.load_bytes()
    if raw is None:
        return None, f"{record.uri}: image bytes not found"
    sha256 = record.sha256 or hashlib.sha256(raw).hexdigest()
    photo_id = sha256[:16]
    try:
        rendition = render(raw, out_dir, photo_id)
    except OSError as exc:  # PIL.UnidentifiedImageError is an OSError
        return None, f"{record.uri}: unreadable image ({exc})"
    derived = explain(record.caption)
    return {
        "id": photo_id,
        "sha256": sha256,
        "image": rendition.image,
        "thumb": rendition.thumb,
        "xmp": _write_xmp(out_dir, photo_id, record.caption),
        "width": rendition.width,
        "height": rendition.height,
        "color": rendition.color,
        "caption": record.caption,
        **derived,
        "exif": rendition.exif,
        "provenance": record.provenance,
    }, None


def write_gallery(out_dir: Path, photos: list[dict], *, source: str, queue: int | None = None) -> None:
    """Atomically rewrite ``index.json``. ``queue`` is how many folder images are still uncaptioned."""
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {
        "version": INDEX_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": source,
        "lens_version": argus_lens.__version__,
        "categories": CATEGORIES,
        "photos": photos,
    }
    if queue is not None:
        index["queue"] = max(queue, 0)
    _atomic_json(out_dir / "index.json", index)
    # A tiny sibling the gallery polls. The photo list stays put until the
    # reader asks for it, so a long caption run does not re-download index.json.
    if queue is not None:
        _atomic_json(
            out_dir / "status.json",
            {"queue": index["queue"], "count": len(photos), "generated_at": index["generated_at"]},
        )


def _atomic_json(dest: Path, payload: dict) -> None:
    tmp = dest.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(dest)


def upsert_photo(out_dir: Path, record: SourceRecord, *, source: str, queue: int) -> str | None:
    """Render *record* into the live gallery index. A skip reason means it was not added."""
    photo, reason = render_photo(record, out_dir)
    photos = [item for item in read_photos(out_dir) if item.get("id") != (photo or {}).get("id")]
    if photo is None:
        write_gallery(out_dir, photos, source=source, queue=queue)
        return reason
    photos.append(photo)
    write_gallery(out_dir, photos, source=source, queue=queue)
    return None


def finish_gallery(out_dir: Path, *, source: str) -> None:
    """Mark the folder bake finished and drop renditions no longer in the index."""
    photos = read_photos(out_dir)
    _prune(out_dir, {str(photo["id"]) for photo in photos})
    write_gallery(out_dir, photos, source=source, queue=0)


def _write_xmp(out_dir: Path, photo_id: str, caption: dict) -> str:
    """Render the XMP sidecar lens's ``write_xmp`` would write for this caption (same keywords, same writer)."""
    keywords = [t.strip() for t in (caption.get("raw_tags") or "").split(",") if t.strip()]
    path = out_dir / "xmp" / f"{photo_id}.xmp"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(XmpSink().render(keywords=keywords, description=caption.get("final_caption", "")), encoding="utf-8")
    return f"xmp/{photo_id}.xmp"


def _prune(out_dir: Path, keep: set[str]) -> None:
    """Drop renditions left over from a previous bake (only inside our own subdirs)."""
    for sub, pattern in (("images", "*.webp"), ("thumbs", "*.webp"), ("xmp", "*.xmp")):
        for path in (out_dir / sub).glob(pattern):
            if path.stem not in keep:
                path.unlink()
