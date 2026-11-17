from __future__ import annotations

import io
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image

import lightbox_bake.folder as folder_mod
from lightbox_bake.cli import main
from lightbox_bake.fixture import fixture_records
from lightbox_bake.folder import caption_record, iter_images, remember_caption_choice
from lightbox_bake.index import write_gallery
from lightbox_bake.serve import _resolve, make_handler


def _jpeg(color: str = "#448866") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 24), color).save(buf, "JPEG")
    return buf.getvalue()


def _wait_for(url: str) -> None:
    for _ in range(50):
        try:
            urlopen(url, timeout=0.2).read()
            return
        except OSError:
            time.sleep(0.05)
    raise AssertionError(f"server did not accept connections: {url}")


def _lens_payload() -> dict:
    caption = next(fixture_records()).caption
    keys = ("final_caption", "caption_variants", "selected_category", "raw_tags", "raw_prose", "backend_name")
    return {key: caption[key] for key in keys}


def test_prune_cache_keeps_this_folder_and_a_profile_suffix(tmp_path) -> None:
    from lightbox_bake.folder import prune_cache

    sha = "ab" * 32
    (tmp_path / f"{sha}.json").write_text("{}", encoding="utf-8")
    (tmp_path / f"{sha}.qwen.json").write_text("{}", encoding="utf-8")
    other = tmp_path / f"{'cd' * 32}.json"
    other.write_text("{}", encoding="utf-8")
    assert prune_cache(tmp_path, {sha}) == 1
    assert (tmp_path / f"{sha}.json").is_file()
    assert (tmp_path / f"{sha}.qwen.json").is_file()
    assert not other.exists()


def test_purge_command_clears_gallery_and_cache(tmp_path) -> None:
    root = tmp_path / "state"
    (root / "data").mkdir(parents=True)
    (root / "cache").mkdir()
    (root / "data" / "index.json").write_text("{}", encoding="utf-8")
    (root / "cache" / "abc.json").write_text("{}", encoding="utf-8")
    assert main(["purge", "--root", str(root)]) == 0
    assert not (root / "data" / "index.json").exists()
    assert not (root / "cache" / "abc.json").exists()
    assert (root / "data").is_dir()
    assert (root / "cache").is_dir()


def test_caption_cache_keeps_hybrid_names_and_separates_another_profile(tmp_path, monkeypatch) -> None:
    from lightbox_bake.folder import _cache_file

    monkeypatch.delenv("CAPTION_CACHE_KEY", raising=False)
    assert _cache_file(tmp_path, "abc").name == "abc.json"
    monkeypatch.setenv("CAPTION_CACHE_KEY", "qwen3-vl:8b-instruct")
    name = _cache_file(tmp_path, "abc").name
    assert name.startswith("abc.qwen3-vl_8b-instruct-") and name.endswith(".json")
    # Keys that read the same once sanitised still get their own files.
    monkeypatch.setenv("CAPTION_CACHE_KEY", "qwen3-vl/8b-instruct")
    assert _cache_file(tmp_path, "abc").name != name
    monkeypatch.setenv("CAPTION_CACHE_KEY", "///")
    punct = _cache_file(tmp_path, "abc").name
    monkeypatch.setenv("CAPTION_CACHE_KEY", ":::")
    assert _cache_file(tmp_path, "abc").name != punct


def test_caption_record_keeps_a_checked_rewrite_and_the_cache_round_trips_it(tmp_path, monkeypatch) -> None:
    from lightbox_bake.folder import _read_cache, _write_cache

    payload = _lens_payload()
    payload["metadata"] = {"refine": {"model": "qwen3:8b", "accepted": ["identity"], "skipped": ""}}
    recorded = caption_record(payload)
    assert recorded["refine"] == {"model": "qwen3:8b", "accepted": ["identity"]}
    monkeypatch.delenv("CAPTION_CACHE_KEY", raising=False)
    sha = "ab" * 32
    _write_cache(tmp_path, sha, recorded)
    assert _read_cache(tmp_path, sha)["refine"] == recorded["refine"]


def test_iter_images_skips_non_images_and_dot_paths(tmp_path) -> None:
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "note.txt").write_bytes(b"x")
    (tmp_path / ".hidden.jpg").write_bytes(b"x")
    (tmp_path / "roll").mkdir()
    (tmp_path / "roll" / "b.PNG").write_bytes(b"x")
    (tmp_path / ".trash").mkdir()
    (tmp_path / ".trash" / "c.jpg").write_bytes(b"x")

    found = [path.relative_to(tmp_path).as_posix() for path in iter_images(tmp_path)]
    assert found == ["a.jpg", "roll/b.PNG"]
    top = [path.name for path in iter_images(tmp_path, recursive=False)]
    assert top == ["a.jpg"]


def test_caption_record_keeps_wire_fields_and_rejects_a_bare_error() -> None:
    record = caption_record(_lens_payload())
    assert record["profile"]["target_category"] == "identity"
    assert record["raw_tags"]
    try:
        caption_record({"detail": "nope"})
    except ValueError:
        return
    raise AssertionError("expected ValueError")


class _Lens(BaseHTTPRequestHandler):
    posts = 0
    payload: dict = {}

    def log_message(self, fmt: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        type(self).posts += 1
        body = json.dumps(type(self).payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def test_folder_bake_caches_captions_and_hides_the_path(tmp_path, monkeypatch) -> None:
    photos = tmp_path / "photos"
    nested = photos / "2024"
    nested.mkdir(parents=True)
    (nested / "beach.jpg").write_bytes(_jpeg())
    (photos / "readme.txt").write_bytes(b"not a photo")
    out = tmp_path / "data"
    cache = tmp_path / "cache"
    cache.mkdir()
    stale = cache / f"{'ab' * 32}.json"
    stale.write_text("{}", encoding="utf-8")
    _Lens.posts = 0
    _Lens.payload = _lens_payload()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Lens)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    _wait_for(f"http://127.0.0.1:{port}/health")
    args = [
        "folder",
        "--photos",
        str(photos),
        "--out",
        str(out),
        "--cache",
        str(cache),
        "--lens-url",
        f"http://127.0.0.1:{port}",
    ]
    try:
        assert main(args) == 0
        assert _Lens.posts == 1
    finally:
        server.shutdown()
        server.server_close()

    index = json.loads((out / "index.json").read_text())
    assert index["source"] == "folder"
    assert index["queue"] == 0
    status = json.loads((out / "status.json").read_text())
    assert status["queue"] == 0 and status["count"] == 1
    photo = index["photos"][0]
    assert photo["provenance"] == {"source": "local folder", "title": "beach"}
    assert str(photos) not in json.dumps(photo)
    assert (out / photo["image"]).is_file()
    assert "red dress" in (out / photo["xmp"]).read_text()
    assert not stale.exists()
    assert any(cache.glob("*.json"))

    def _refuse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("cached photos must not call lens")

    monkeypatch.setattr("lightbox_bake.folder.wait_until_ready", _refuse)
    monkeypatch.setattr("lightbox_bake.folder.caption_file", _refuse)
    assert main(args) == 0
    again = json.loads((out / "index.json").read_text())
    assert again["queue"] == 0 and [p["id"] for p in again["photos"]] == [photo["id"]]
    status = json.loads((out / "status.json").read_text())
    assert status["queue"] == 0 and status["count"] == 1
    assert "red dress" in (out / again["photos"][0]["xmp"]).read_text()


def test_folder_publishes_the_queue_before_each_caption_lands(tmp_path, monkeypatch) -> None:
    photos = tmp_path / "photos"
    photos.mkdir()
    (photos / "a.jpg").write_bytes(_jpeg("#112233"))
    (photos / "b.jpg").write_bytes(_jpeg("#445566"))
    out = tmp_path / "data"
    snaps: list[dict] = []
    real = folder_mod.caption_file

    def spy(url: str, path: Path, data: bytes) -> dict:
        snaps.append(json.loads((out / "index.json").read_text()))
        return real(url, path, data)

    monkeypatch.setattr(folder_mod, "caption_file", spy)
    _Lens.posts = 0
    _Lens.payload = _lens_payload()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Lens)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    _wait_for(f"http://127.0.0.1:{port}/health")
    try:
        assert (
            main(["folder", "--photos", str(photos), "--out", str(out), "--lens-url", f"http://127.0.0.1:{port}"]) == 0
        )
    finally:
        server.shutdown()
        server.server_close()

    assert [snap["queue"] for snap in snaps] == [2, 1]
    assert [len(snap["photos"]) for snap in snaps] == [0, 1]
    done = json.loads((out / "index.json").read_text())
    assert done["queue"] == 0 and len(done["photos"]) == 2
    assert all(photo["thumb"].startswith("thumbs/") for photo in done["photos"])
    assert json.loads((out / "status.json").read_text())["count"] == 2


def test_serve_shows_a_status_page_until_the_bake_finishes(tmp_path) -> None:
    html = tmp_path / "html"
    data = tmp_path / "data"
    html.mkdir()
    data.mkdir()
    (html / "index.html").write_text("gallery", encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(html, data))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    try:
        _wait_for(f"http://127.0.0.1:{port}/")
        waiting = urlopen(f"http://127.0.0.1:{port}/").read()
        assert b"Captioning photos" in waiting
        (data / "index.json").write_text("{}", encoding="utf-8")
        assert urlopen(f"http://127.0.0.1:{port}/").read() == b"gallery"
    finally:
        server.shutdown()
        server.server_close()


def test_serve_uses_baked_data_and_refuses_traversal(tmp_path) -> None:
    html = tmp_path / "html"
    data = tmp_path / "data"
    (html / "data").mkdir(parents=True)
    data.mkdir()
    (html / "index.html").write_text("gallery", encoding="utf-8")
    (html / "data" / "index.json").write_text('{"source":"fixture"}', encoding="utf-8")
    (data / "index.json").write_text('{"source":"folder"}', encoding="utf-8")
    (data / "images").mkdir()
    (data / "images" / "a.webp").write_bytes(b"webp")

    assert _resolve(html, data, "/data/../index.html") is None
    assert _resolve(html, data, "/") == (html / "index.html").resolve()
    assert _resolve(html, data, "/data/index.json") == (data / "index.json").resolve()

    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(html, data))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    _wait_for(f"http://127.0.0.1:{port}/")
    try:
        assert urlopen(f"http://127.0.0.1:{port}/").read() == b"gallery"
        opened = urlopen(f"http://127.0.0.1:{port}/data/index.json")
        body = opened.read()
        assert b'"folder"' in body
        assert opened.headers.get("Cache-Control") == "no-store"
        assert urlopen(f"http://127.0.0.1:{port}/data/images/a.webp").read() == b"webp"
        try:
            urlopen(f"http://127.0.0.1:{port}/missing")
        except HTTPError as exc:
            assert exc.code == 404
        else:
            raise AssertionError("expected 404")
    finally:
        server.shutdown()
        server.server_close()


def test_caption_choice_updates_the_index_and_cache(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("CAPTION_CACHE_KEY", raising=False)
    record = next(item for item in fixture_records() if item.caption["caption_variants"].get("pose_composition"))
    photo_id = "abc123def4567890"
    sha = photo_id + ("ab" * 24)
    pose = record.caption["caption_variants"]["pose_composition"]
    photo = {
        "id": photo_id,
        "sha256": sha,
        "image": f"images/{photo_id}.webp",
        "thumb": f"thumbs/{photo_id}.webp",
        "xmp": f"xmp/{photo_id}.xmp",
        "width": 4,
        "height": 3,
        "color": "#000000",
        "caption": record.caption,
        "explain": {},
        "compare": {},
        "facets": {},
        "exif": {},
        "provenance": {},
    }
    html = tmp_path / "html"
    data = tmp_path / "data"
    cache = tmp_path / "cache"
    html.mkdir()
    cache.mkdir()
    (html / "index.html").write_text("gallery", encoding="utf-8")
    write_gallery(data, [photo], source="folder", queue=0)
    (cache / f"{sha}.json").write_text(
        json.dumps({"final_caption": "old", "selected_category": "identity"}),
        encoding="utf-8",
    )

    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(html, data, cache))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    _wait_for(f"http://127.0.0.1:{port}/")
    body = json.dumps({"ids": [photo_id], "category": "pose_composition"}).encode()
    try:
        url = f"http://127.0.0.1:{port}/api/caption-choice"
        # A cross-site form or no-cors fetch (text/plain, or another Origin) changes nothing.
        for headers, code in (
            ({"Content-Type": "text/plain"}, 415),
            ({"Content-Type": "application/json", "Origin": "https://evil.example"}, 403),
            ({"Content-Type": "application/json", "Sec-Fetch-Site": "cross-site"}, 403),
        ):
            try:
                urlopen(Request(url, data=body, method="POST", headers=headers))
            except HTTPError as exc:
                assert exc.code == code
            else:
                raise AssertionError(f"expected {code} for {headers}")
        try:
            urlopen(Request(url, data=b"\xff\xfe\x00{", method="POST", headers={"Content-Type": "application/json"}))
        except HTTPError as exc:
            assert exc.code == 400
        else:
            raise AssertionError("expected 400 for a body that is not text")
        same = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}"}
        opened = urlopen(Request(url, data=body, method="POST", headers=same))
        payload = json.loads(opened.read())
    finally:
        server.shutdown()
        server.server_close()

    assert payload["updated"] == [photo_id]
    saved = json.loads((data / "index.json").read_text(encoding="utf-8"))
    assert saved["photos"][0]["caption"]["final_caption"] == pose
    cached = json.loads((cache / f"{sha}.json").read_text(encoding="utf-8"))
    assert cached["final_caption"] == pose
    assert cached["selected_category"] == "pose_composition"
    assert remember_caption_choice(cache, "f" * 64, final_caption="x", selected_category="setting") is False


def test_multipart_filename_cannot_break_out_of_its_header() -> None:
    from lightbox_bake.folder import _multipart

    evil = 'a"\r\nContent-Type: text/html\r\n\r\n\\x\udcff.jpg'
    body, content_type = _multipart(evil, b"DATA", "image/jpeg")
    boundary = content_type.split("boundary=", 1)[1]
    head = body.split(b"DATA", 1)[0].decode("utf-8")
    disposition = next(line for line in head.split("\r\n") if 'name="file"' in line)
    assert disposition.endswith('filename="a___Content-Type: text/html_____x_.jpg"')
    # The profile fields plus the file: no injected parts.
    assert body.count(f"--{boundary}\r\n".encode()) == 4


def test_cache_with_invalid_utf8_is_a_miss(tmp_path, monkeypatch) -> None:
    from lightbox_bake.folder import _read_cache

    monkeypatch.delenv("CAPTION_CACHE_KEY", raising=False)
    sha = "ab" * 32
    (tmp_path / f"{sha}.json").write_bytes(b"\xff\xfe{garbage")
    assert _read_cache(tmp_path, sha) is None
    assert remember_caption_choice(tmp_path, sha, final_caption="x", selected_category="setting") is False


def test_unreachable_lens_is_a_lens_error(tmp_path) -> None:
    import pytest

    from lightbox_bake.folder import LensError, caption_file

    server = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
    port = server.server_address[1]
    server.server_close()  # nothing listens on this port now
    with pytest.raises(LensError):
        caption_file(f"http://127.0.0.1:{port}", tmp_path / "a.jpg", _jpeg())


def test_a_file_that_cannot_be_hashed_keeps_its_cached_caption(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("CAPTION_CACHE_KEY", raising=False)
    photos = tmp_path / "photos"
    photos.mkdir()
    (photos / "a.jpg").write_bytes(_jpeg("#112233"))
    (photos / "b.jpg").write_bytes(_jpeg("#445566"))
    cache = tmp_path / "cache"
    cache.mkdir()
    real = folder_mod.file_sha256
    shas = {name: real(photos / name) for name in ("a.jpg", "b.jpg")}
    for sha in shas.values():
        (cache / f"{sha}.json").write_text(json.dumps(_lens_payload()), encoding="utf-8")

    def flaky(path: Path) -> str:
        if path.name == "b.jpg":
            raise OSError("share went away")
        return real(path)

    monkeypatch.setattr(folder_mod, "file_sha256", flaky)
    folder_mod.stream_folder(photos, "http://127.0.0.1:9", tmp_path / "data", cache=cache)
    assert (cache / f"{shas['b.jpg']}.json").is_file()


def _serve(html: Path, data: Path):
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(html, data))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def test_serve_escapes_the_error_page_and_answers_health(tmp_path) -> None:
    html, data = tmp_path / "html", tmp_path / "data"
    html.mkdir()
    data.mkdir()
    (html / "index.html").write_text("gallery", encoding="utf-8")
    (data / "error.txt").write_text("<img src=x onerror=alert(1)>.jpg failed", encoding="utf-8")
    server, base = _serve(html, data)
    try:
        _wait_for(base + "/")
        page = urlopen(base + "/").read()
        assert b"<img" not in page and b"&lt;img src=x" in page
        health = urlopen(base + "/health")
        assert health.status == 200 and json.loads(health.read()) == {"ok": True, "ready": False}
    finally:
        server.shutdown()
        server.server_close()


def test_serve_does_not_follow_a_directory_index_out_of_root(tmp_path) -> None:
    html, data = tmp_path / "html", tmp_path / "data"
    (html / "sub").mkdir(parents=True)
    data.mkdir()
    secret = tmp_path / "secret.html"
    secret.write_text("secret", encoding="utf-8")
    (html / "sub" / "index.html").symlink_to(secret)
    assert _resolve(html, data, "/sub") is None
    assert _resolve(html, data, "/sub/") is None
