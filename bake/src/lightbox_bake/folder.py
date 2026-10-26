"""Caption a folder of photos through a running lens server, then bake them.

The folder is the gallery input: a local directory, a NAS share, or a USB
drive mounted into the container. Bytes are uploaded to ``POST /caption``
(the folder endpoint only returns the final string, and the explain view
needs the raw tags and prose). Nothing is written back next to the originals.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from lightbox_bake.index import BakeStats, finish_gallery, read_photos, render_photo, write_gallery
from lightbox_bake.sources import SourceRecord

# Same set lens's filesystem connector walks, plus ``.tif`` (common on cameras;
# the upload endpoint captions bytes, so the suffix only decides what we send).
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}

# Sent with every request and stored on the caption so explain recomposes
# with the same profile the server was asked to use.
_PROFILE = {"target_style": "photo", "target_category": "identity", "target_backend": "sdxl"}
_CAPTION_FIELDS = ("final_caption", "caption_variants", "selected_category", "raw_tags", "raw_prose", "backend_name")

_READY_TIMEOUT_S = 180
_CAPTION_TIMEOUT_S = 900
_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


class LensError(Exception):
    """Lens responded, but not with a caption for this image."""


def iter_images(root: Path, *, recursive: bool = True) -> list[Path]:
    """Image files under *root*, skipping dotfiles and dot-directories."""
    if not root.is_dir():
        raise SystemExit(f"photo folder is not a directory: {root}")
    paths = root.rglob("*") if recursive else root.iterdir()
    found: list[Path] = []
    for path in paths:
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part.startswith(".") for part in rel.parts):
            continue
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        found.append(path)
    return sorted(found, key=lambda p: p.relative_to(root).as_posix())


def caption_record(payload: dict[str, Any]) -> dict[str, Any]:
    """Keep the CaptionResult fields the index stores, plus the profile we requested."""
    final = payload.get("final_caption")
    if not isinstance(final, str):
        raise ValueError("lens response has no final_caption")
    raw_variants = payload.get("caption_variants") or {}
    variants = (
        {str(key): value for key, value in raw_variants.items() if isinstance(value, str)}
        if isinstance(raw_variants, dict)
        else {}
    )
    return {
        "final_caption": final,
        "caption_variants": variants,
        "selected_category": str(payload.get("selected_category") or "identity"),
        "raw_tags": str(payload.get("raw_tags") or ""),
        "raw_prose": str(payload.get("raw_prose") or ""),
        "backend_name": str(payload.get("backend_name") or ""),
        "profile": dict(_PROFILE),
        "version": 1,
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cache_file(cache: Path, sha256: str) -> Path:
    """Cache file for one image. A non-default caption profile gets its own file, so hybrid hits are not reused."""
    profile = os.environ.get("CAPTION_CACHE_KEY", "").strip()
    if not profile:
        return cache / f"{sha256}.json"
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in profile)[:120].strip("._")
    return cache / f"{sha256}.{safe or 'profile'}.json"


def _read_cache(cache: Path | None, sha256: str) -> dict[str, Any] | None:
    if cache is None:
        return None
    try:
        payload = json.loads(_cache_file(cache, sha256).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        return caption_record(payload)
    except ValueError:
        return None


def prune_cache(cache: Path | None, keep: set[str]) -> int:
    """Delete caption files whose sha256 is not in *keep*. Returns how many were removed."""
    if cache is None or not cache.is_dir():
        return 0
    removed = 0
    for path in cache.iterdir():
        if not path.is_file() or not path.name.endswith(".json"):
            continue
        if path.name.split(".", 1)[0] not in keep:
            path.unlink()
            removed += 1
    return removed


def purge_store(root: Path) -> None:
    """Remove a baked gallery and its caption cache. Recreates the two directories empty.

    ``data/`` holds ``index.json``, renditions, and sidecars. ``cache/`` holds caption JSON.
    The photo folder and lens's downloaded models live elsewhere and are not touched.
    """
    for name in ("data", "cache"):
        target = root / name
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)


def _write_cache(cache: Path | None, sha256: str, caption: dict[str, Any]) -> None:
    if cache is None:
        return
    cache.mkdir(parents=True, exist_ok=True)
    dest = _cache_file(cache, sha256)
    tmp = dest.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({k: caption[k] for k in _CAPTION_FIELDS}, ensure_ascii=False), encoding="utf-8")
    tmp.replace(dest)


def wait_until_ready(lens_url: str, *, timeout_s: float = _READY_TIMEOUT_S) -> None:
    """Block until ``GET /health`` succeeds. The first caption is what loads the model."""
    health = lens_url.rstrip("/") + "/health"
    deadline = time.monotonic() + timeout_s
    last = "no response"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health, timeout=5) as response:
                if response.status == 200:
                    return
                last = f"HTTP {response.status}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = str(exc)
        time.sleep(2)
    raise SystemExit(f"lens at {lens_url} did not become ready ({last})")


def _multipart(filename: str, content: bytes, mime: str) -> tuple[bytes, str]:
    boundary = "----lightbox-" + uuid.uuid4().hex
    while boundary.encode() in content:
        boundary = "----lightbox-" + uuid.uuid4().hex
    fields = "".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'
        for key, value in _PROFILE.items()
    )
    head = (
        f'{fields}--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    body = head + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def caption_file(lens_url: str, path: Path, data: bytes) -> dict[str, Any]:
    """Upload one image to ``POST /caption`` and return the index caption record."""
    safe_name = path.name.replace('"', "").replace("\r", "").replace("\n", "") or "image"
    body, content_type = _multipart(safe_name, data, _MIME.get(path.suffix.lower(), "application/octet-stream"))
    request = urllib.request.Request(
        lens_url.rstrip("/") + "/caption",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_CAPTION_TIMEOUT_S) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise LensError(f"HTTP {exc.code}: {detail}") from exc
    if not isinstance(payload, dict):
        raise LensError("lens response was not a JSON object")
    return caption_record(payload)


def _record(path: Path, sha256: str, caption: dict[str, Any]) -> SourceRecord:
    def load(path: Path = path) -> bytes | None:
        try:
            return path.read_bytes()
        except OSError:
            return None

    # The absolute path stays out of the published index. build_index keeps
    # provenance and the content hash, and renditions are re-encoded.
    return SourceRecord(
        uri=path.name,
        sha256=sha256,
        caption=caption,
        load_bytes=load,
        provenance={"source": "local folder", "title": path.stem.replace("-", " ").replace("_", " ")},
    )


def _renditions_present(out: Path, photo: dict) -> bool:
    image, thumb = photo.get("image"), photo.get("thumb")
    return isinstance(image, str) and isinstance(thumb, str) and (out / image).is_file() and (out / thumb).is_file()


def stream_folder(
    root: Path,
    lens_url: str,
    out: Path,
    *,
    cache: Path | None = None,
    limit: int | None = None,
    recursive: bool = True,
    recaption: bool = False,
) -> BakeStats:
    """Caption *root* and publish the gallery as each photo becomes ready.

    ``index.json`` is written before the first lens call, with ``queue`` set to
    how many images are not in the gallery yet. Cached captions are published
    in one batch. Each new caption is added on its own. ``status.json`` carries
    the queue and the count so the page can wait for a click before fetching
    the photo list again.
    """
    if limit is not None and limit < 1:
        raise SystemExit("--limit must be a positive number")
    images = iter_images(root, recursive=recursive)
    if limit is not None:
        images = images[:limit]
    if not images:
        suffixes = ", ".join(sorted(IMAGE_SUFFIXES))
        raise SystemExit(f"no captionable images under {root} (looking for {suffixes}; dot-folders are skipped)")

    total = len(images)
    stats = BakeStats()
    photos: list[dict] = []
    seen: set[str] = set()
    pending: list[tuple[Path, str]] = []
    cached: list[tuple[Path, str, dict[str, Any]]] = []
    kept_sha: set[str] = set()
    prior = {} if recaption else {str(photo["id"]): photo for photo in read_photos(out)}

    def publish() -> None:
        write_gallery(out, photos, source="folder", queue=total - len(photos) - len(stats.skipped))

    # Open the gallery before hashing so a large folder is not a blank port.
    publish()
    for path in images:
        rel = path.relative_to(root).as_posix()
        try:
            sha256 = file_sha256(path)
        except OSError as exc:
            stats.skipped.append(f"{rel}: {exc}")
            print(f"  skipped {rel}: {exc}", file=sys.stderr)
            continue
        kept_sha.add(sha256)
        photo_id = sha256[:16]
        if photo_id in seen:
            stats.skipped.append(f"{rel}: duplicate of {photo_id}")
            print(f"  skipped {rel}: duplicate of {photo_id}", file=sys.stderr)
            continue
        seen.add(photo_id)
        hit = None if recaption else _read_cache(cache, sha256)
        if hit is None:
            pending.append((path, sha256))
            continue
        print(f"cached {rel}", flush=True)
        cached.append((path, sha256, hit))

    for path, sha256, hit in cached:
        kept = prior.get(sha256[:16])
        if kept is not None and _renditions_present(out, kept):
            photos.append(kept)
            stats.baked += 1
            stats.drifted += bool((kept.get("explain") or {}).get("drift"))
            continue
        _add_photo(_record(path, sha256, hit), out, photos, stats)
    publish()

    if pending:
        print(f"captioning {len(pending)} image(s) via {lens_url} ({stats.baked} cached)", flush=True)
        wait_until_ready(lens_url)
        for path, sha256 in pending:
            rel = path.relative_to(root).as_posix()
            print(f"captioning {rel}", flush=True)
            try:
                caption = caption_file(lens_url, path, path.read_bytes())
            except (OSError, LensError, ValueError, json.JSONDecodeError) as exc:
                stats.skipped.append(f"{rel}: {exc}")
                print(f"  skipped {rel}: {exc}", file=sys.stderr)
                publish()
                continue
            _write_cache(cache, sha256, caption)
            _add_photo(_record(path, sha256, caption), out, photos, stats)
            publish()
    elif stats.baked:
        print(f"{stats.baked} cached caption(s); lens was not called", flush=True)

    finish_gallery(out, source="folder")
    # A capped walk must not throw away captions for files it never opened.
    if limit is None:
        removed = prune_cache(cache, kept_sha)
        if removed:
            print(f"dropped {removed} cached caption(s) that are not in this folder", flush=True)
    return stats


def _add_photo(record: SourceRecord, out: Path, photos: list[dict], stats: BakeStats) -> bool:
    """Render *record* onto *photos*. False means it was skipped and already recorded."""
    photo, reason = render_photo(record, out)
    if photo is None:
        stats.skipped.append(reason or f"{record.uri}: skipped")
        print(f"  skipped {reason}", file=sys.stderr)
        return False
    stats.drifted += bool(photo["explain"]["drift"])
    stats.baked += 1
    photos.append(photo)
    return True
