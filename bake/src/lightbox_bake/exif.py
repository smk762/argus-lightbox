"""EXIF extraction for the metadata panel.

GPS is **never** emitted: the index is published as a static site, and a photo's
location is not something a caption demo should leak. Everything else is
normalised into display-ready fields; absent tags are simply omitted.
"""

from __future__ import annotations

from datetime import datetime
from fractions import Fraction
from typing import Any

from PIL import Image

_EXIF_IFD = 0x8769
_MAKE, _MODEL, _SOFTWARE, _DATETIME = 0x010F, 0x0110, 0x0131, 0x0132
_EXPOSURE, _FNUMBER, _ISO, _DATETIME_ORIGINAL = 0x829A, 0x829D, 0x8827, 0x9003
_FOCAL, _FOCAL_35MM, _LENS_MODEL = 0x920A, 0xA405, 0xA434


def _num(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _clean(value: Any) -> str | None:
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    if not isinstance(value, str):
        return None
    value = value.strip("\x00 ").strip()
    return value or None


def _shutter(seconds: float) -> str:
    if seconds >= 1:
        return f"{seconds:g}s"
    return f"1/{round(1 / seconds)}s" if seconds > 0 else ""


def _taken_at(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        return None


def read_exif(img: Image.Image) -> dict[str, Any]:
    """Return display-ready EXIF fields for *img* (GPS deliberately excluded)."""
    exif = img.getexif()
    sub = exif.get_ifd(_EXIF_IFD)
    out: dict[str, Any] = {}

    make, model = _clean(exif.get(_MAKE)), _clean(exif.get(_MODEL))
    if model and make and not model.lower().startswith(make.lower().split()[0]):
        out["camera"] = f"{make} {model}"
    elif model or make:
        out["camera"] = model or make
    if lens := _clean(sub.get(_LENS_MODEL)):
        out["lens"] = lens
    if (focal := _num(sub.get(_FOCAL))) is not None:
        out["focal_length_mm"] = round(focal, 1)
    if (focal35 := _num(sub.get(_FOCAL_35MM))) is not None and focal35 > 0:
        out["focal_length_35mm"] = int(focal35)
    if (fnum := _num(sub.get(_FNUMBER))) is not None:
        out["aperture"] = round(fnum, 1)
    if (exposure := _num(sub.get(_EXPOSURE))) is not None and exposure > 0:
        out["exposure_s"] = exposure
        out["shutter"] = _shutter(float(Fraction(exposure).limit_denominator(8000)))
    iso = sub.get(_ISO)
    if isinstance(iso, tuple):
        iso = iso[0] if iso else None
    if (iso_num := _num(iso)) is not None:
        out["iso"] = int(iso_num)
    if taken := _taken_at(_clean(sub.get(_DATETIME_ORIGINAL)) or _clean(exif.get(_DATETIME))):
        out["taken_at"] = taken
    if software := _clean(exif.get(_SOFTWARE)):
        out["software"] = software
    return out
