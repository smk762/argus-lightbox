"""Assemble ``index.json`` — the static data contract the web app reads.

Shape (``version`` 1.x)::

    {
      "version": "1.0", "generated_at": ISO-8601, "source": "fixture" | "tape",
      "lens_version": "0.7.0", "categories": ["identity", ...],
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
    photos = []
    seen: set[str] = set()
    for record in records:
        raw = record.load_bytes()
        if raw is None:
            stats.skipped.append(f"{record.uri}: image bytes not found")
            continue
        sha256 = record.sha256 or hashlib.sha256(raw).hexdigest()
        photo_id = sha256[:16]
        if photo_id in seen:
            stats.skipped.append(f"{record.uri}: duplicate of {photo_id}")
            continue
        try:
            rendition = render(raw, out_dir, photo_id)
        except OSError as exc:  # PIL.UnidentifiedImageError is an OSError
            stats.skipped.append(f"{record.uri}: unreadable image ({exc})")
            continue
        seen.add(photo_id)
        derived = explain(record.caption)
        xmp = _write_xmp(out_dir, photo_id, record.caption)
        stats.drifted += derived["explain"]["drift"]
        photos.append(
            {
                "id": photo_id,
                "sha256": sha256,
                "image": rendition.image,
                "thumb": rendition.thumb,
                "xmp": xmp,
                "width": rendition.width,
                "height": rendition.height,
                "color": rendition.color,
                "caption": record.caption,
                **derived,
                "exif": rendition.exif,
                "provenance": record.provenance,
            }
        )
        stats.baked += 1

    _prune(out_dir, seen)
    index = {
        "version": INDEX_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": source,
        "lens_version": argus_lens.__version__,
        "categories": CATEGORIES,
        "photos": photos,
    }
    (out_dir / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return stats


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
