"""Web renditions: a display image, grid thumbnails at a few widths, and a placeholder colour."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from lightbox_bake.exif import read_exif

FULL_MAX = 2048  # long side of the detail-view image, loaded only when a photo is opened
THUMB_MAX = 480  # long side of the grid thumbnail; the gallery pages these and does not mount the full rendition
# Narrower grid thumbnails for the web's srcset (index 1.2 ``thumbs``). A grid column is about 175-185 CSS px
# on a phone and 210-360 px on wider screens, so 240 covers a 1x-1.3x phone, 360 a 2x phone (or a Moto-class
# 1.75x one), and the 480 thumbnail stays for desktop columns and 3x phones. A width is only written when it is
# narrower than the 480 thumbnail (a portrait one is already 320 wide).
THUMB_WIDTHS = (240, 360)
THUMB_QUALITY = 72


@dataclass
class Rendition:
    """What the index records about an image's web renditions."""

    image: str  # path relative to the data dir
    thumb: str
    thumbs: list[dict]  # [{"src", "width"}], narrowest first; the last is ``thumb``
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


def _save_width(img: Image.Image, path: Path, width: int) -> int:
    copy = img.copy()
    copy.thumbnail((width, 1 << 16), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    copy.save(path, "WEBP", quality=THUMB_QUALITY, method=6)
    return copy.width


def thumb_set(img: Image.Image, out_dir: Path, photo_id: str, thumb_width: int) -> list[dict]:
    """Write ``thumbs/<w>/<id>.webp`` for each of ``THUMB_WIDTHS`` narrower than the main thumbnail.

    Returns the srcset entries, narrowest first, ending with the main ``thumbs/<id>.webp``
    (*thumb_width* wide). *img* is the decoded, upright RGB image.
    """
    out = [
        {
            "src": f"thumbs/{w}/{photo_id}.webp",
            "width": _save_width(img, out_dir / "thumbs" / str(w) / f"{photo_id}.webp", w),
        }
        for w in THUMB_WIDTHS
        if w < thumb_width
    ]
    return [*out, {"src": f"thumbs/{photo_id}.webp", "width": thumb_width}]


def decode(raw: bytes) -> tuple[Image.Image, dict]:
    """The upright RGB image and its display EXIF."""
    with Image.open(io.BytesIO(raw)) as src:
        exif = read_exif(src)
        img = ImageOps.exif_transpose(src).convert("RGB")
    return img, exif


def render(raw: bytes, out_dir: Path, photo_id: str) -> Rendition:
    """Decode *raw*, read its EXIF, and write ``images/<id>.webp``, ``thumbs/<id>.webp`` and the narrower thumbnails.

    Renditions are re-encoded, so no source metadata (GPS included) survives
    into the published files.
    """
    img, exif = decode(raw)
    width, height = _save(img, out_dir / "images" / f"{photo_id}.webp", FULL_MAX, 82)
    thumb_width, _ = _save(img, out_dir / "thumbs" / f"{photo_id}.webp", THUMB_MAX, THUMB_QUALITY, method=4)
    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return Rendition(
        image=f"images/{photo_id}.webp",
        thumb=f"thumbs/{photo_id}.webp",
        thumbs=thumb_set(img, out_dir, photo_id, thumb_width),
        width=width,
        height=height,
        color=f"#{r:02x}{g:02x}{b:02x}",
        exif=exif,
    )
