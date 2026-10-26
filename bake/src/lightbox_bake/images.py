"""Web renditions: a display image, a grid thumbnail, and a placeholder colour."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from lightbox_bake.exif import read_exif

FULL_MAX = 2048  # long side of the detail-view image, loaded only when a photo is opened
THUMB_MAX = 480  # long side of the grid thumbnail; the gallery pages these and does not mount the full rendition


@dataclass
class Rendition:
    """What the index records about an image's web renditions."""

    image: str  # path relative to the data dir
    thumb: str
    width: int
    height: int
    color: str  # average colour, shown while the thumbnail loads
    exif: dict


def _save(img: Image.Image, path: Path, max_side: int, quality: int, *, method: int = 6) -> tuple[int, int]:
    copy = img.copy()
    copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    copy.save(path, "WEBP", quality=quality, method=method)
    return copy.size


def render(raw: bytes, out_dir: Path, photo_id: str) -> Rendition:
    """Decode *raw*, read its EXIF, and write ``images/<id>.webp`` + ``thumbs/<id>.webp``.

    Renditions are re-encoded, so no source metadata (GPS included) survives
    into the published files.
    """
    with Image.open(io.BytesIO(raw)) as src:
        exif = read_exif(src)
        img = ImageOps.exif_transpose(src).convert("RGB")
    width, height = _save(img, out_dir / "images" / f"{photo_id}.webp", FULL_MAX, 82)
    _save(img, out_dir / "thumbs" / f"{photo_id}.webp", THUMB_MAX, 72, method=4)
    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return Rendition(
        image=f"images/{photo_id}.webp",
        thumb=f"thumbs/{photo_id}.webp",
        width=width,
        height=height,
        color=f"#{r:02x}{g:02x}{b:02x}",
        exif=exif,
    )
