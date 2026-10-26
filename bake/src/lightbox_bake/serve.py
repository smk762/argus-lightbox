"""Serve the static gallery with a baked data directory mounted over ``/data``.

The Next export and the bake output live in different directories so a folder
bake can replace the committed fixture without rebuilding the HTML.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from lightbox_bake.folder import remember_caption_choice
from lightbox_bake.index import CaptionChoiceError, choose_final_caption

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/javascript", ".js")


def _under(root: Path, rel: str) -> Path | None:
    """Resolve *rel* inside *root*, or ``None`` when it escapes or is missing."""
    if rel.endswith("/"):
        rel = rel + "index.html"
    root_resolved = root.resolve()
    candidate = (root / rel).resolve()
    if candidate != root_resolved and root_resolved not in candidate.parents:
        return None
    if candidate.is_dir():
        candidate = candidate / "index.html"
    if candidate.is_file():
        return candidate
    nested = (root / rel / "index.html").resolve()
    if root_resolved in nested.parents and nested.is_file():
        return nested
    return None


def _resolve(html_root: Path, data_root: Path, url_path: str) -> Path | None:
    rel = unquote(urlsplit(url_path).path).lstrip("/")
    if rel == "data" or rel.startswith("data/"):
        inner = rel[len("data") :].lstrip("/")
        return _under(data_root, inner)
    return _under(html_root, rel or "index.html")


_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lightbox</title>
{refresh}
<style>
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #10141c; color: #ece7df; font-family: sans-serif; }}
  main {{ max-width: 36rem; padding: 2rem; }}
  p {{ color: #b7b1a6; line-height: 1.5; }}
</style>
</head>
<body>
<main>
  <h1>Lightbox</h1>
  <p>{message}</p>
</main>
</body>
</html>
"""


def _status_page(data_root: Path) -> bytes:
    """A page shown until the bake has written ``index.json``."""
    error = data_root / "error.txt"
    if error.is_file():
        message = error.read_text(encoding="utf-8").strip() or "Captioning failed."
        refresh = ""
    else:
        message = "Captioning photos. This page refreshes on its own, and the gallery opens here when that finishes."
        refresh = '<meta http-equiv="refresh" content="3">'
    return _PAGE.format(refresh=refresh, message=message).encode()


def make_handler(html_root: Path, data_root: Path, cache_root: Path | None = None) -> type[BaseHTTPRequestHandler]:
    """Build a request handler closed over the two roots."""

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, mime: str, body: bytes, *, cache: str | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            if cache:
                self.send_header("Cache-Control", cache)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            # index.json appears once the folder has been counted. Until then
            # the port is already open, so a browser gets a status page instead
            # of a connection reset.
            if not (data_root / "index.json").is_file():
                rel = unquote(urlsplit(self.path).path)
                if rel in ("/", "/index.html"):
                    self._send(200, "text/html; charset=utf-8", _status_page(data_root))
                    return
                self._send(404, "text/plain; charset=utf-8", b"not found\n")
                return
            path = _resolve(html_root, data_root, self.path)
            if path is None:
                self._send(404, "text/plain; charset=utf-8", b"not found\n")
                return
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            # index.json and status.json change while a folder is captioning.
            cache = "no-store" if path.suffix == ".json" else None
            self._send(200, mime, path.read_bytes(), cache=cache)

        def do_POST(self) -> None:
            # Choosing a variant rewrites the index. It is not a static file.
            if urlsplit(self.path).path != "/api/caption-choice":
                self._send(404, "text/plain; charset=utf-8", b"not found\n")
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > 64_000:
                self._json(400, {"error": "expected a small JSON body"})
                return
            try:
                body = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                self._json(400, {"error": "expected JSON"})
                return
            if not isinstance(body, dict):
                self._json(400, {"error": "expected a JSON object"})
                return
            ids = body.get("ids")
            category = body.get("category")
            if not isinstance(ids, list) or not isinstance(category, str):
                self._json(400, {"error": "expected ids and category"})
                return
            try:
                result = choose_final_caption(data_root, ids, category)
            except CaptionChoiceError as exc:
                self._json(exc.status, {"error": str(exc)})
                return
            if cache_root is not None:
                for choice in result["cache"]:
                    remember_caption_choice(
                        cache_root,
                        choice["sha256"],
                        final_caption=choice["final_caption"],
                        selected_category=choice["selected_category"],
                    )
            self._json(200, {"updated": result["updated"], "skipped": result["skipped"]})

        def _json(self, status: int, payload: dict) -> None:
            self._send(status, "application/json", json.dumps(payload).encode(), cache="no-store")

        def log_message(self, fmt: str, *args: object) -> None:
            print(f"{self.address_string()} {fmt % args}", flush=True)

    return Handler


def serve(html_root: Path, data_root: Path, host: str, port: int, cache_root: Path | None = None) -> None:
    """Serve until the process is killed."""
    server = ThreadingHTTPServer((host, port), make_handler(html_root, data_root, cache_root))
    print(f"gallery at http://{host}:{port}/  (data from {data_root})", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    """CLI entry point (``python -m lightbox_bake.serve``)."""
    parser = argparse.ArgumentParser(description="Serve a baked lightbox gallery")
    parser.add_argument("--html", type=Path, required=True, help="Next static export (web/out)")
    parser.add_argument("--data", type=Path, required=True, help="Baked data directory (index.json, images, thumbs)")
    parser.add_argument("--cache", type=Path, help="caption cache, updated when a final caption is chosen")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3000)
    args = parser.parse_args(argv)
    if not (args.html / "index.html").is_file():
        parser.error(f"no index.html in {args.html}")
    args.data.mkdir(parents=True, exist_ok=True)
    serve(args.html, args.data, args.host, args.port, args.cache)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
