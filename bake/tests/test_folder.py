from __future__ import annotations

import io
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from PIL import Image

import lightbox_bake.folder as folder_mod
from lightbox_bake.cli import main
from lightbox_bake.fixture import fixture_records
from lightbox_bake.folder import caption_record, iter_images
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
    assert _cache_file(tmp_path, "abc").name == "abc.qwen3-vl_8b-instruct.json"


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
    assert main(args) == 0


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
