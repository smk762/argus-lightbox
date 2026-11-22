"""Checks for the must-never rules in CLAUDE.md that no behaviour test covered."""

from __future__ import annotations

import ast
import dataclasses
import io
import json
import shutil
import struct
from pathlib import Path

from PIL import Image, ImageCms, IptcImagePlugin

from lightbox_bake.fixture import fixture_records
from lightbox_bake.fixture_check import compare
from lightbox_bake.images import render
from lightbox_bake.index import build_index

SRC = Path(__file__).resolve().parents[1] / "src" / "lightbox_bake"
COMMITTED_FIXTURE = Path(__file__).resolve().parents[2] / "web" / "public" / "data"


def _webp_chunks(data: bytes) -> list[bytes]:
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    chunks, pos = [], 12
    while pos + 8 <= len(data):
        fourcc, size = data[pos : pos + 4], struct.unpack("<I", data[pos + 4 : pos + 8])[0]
        chunks.append(fourcc)
        pos += 8 + size + (size & 1)
    return chunks


def _tagged_jpeg() -> bytes:
    """A JPEG carrying EXIF (with GPS), XMP, an ICC profile and an IPTC (Photoshop APP13) block."""
    exif = Image.Exif()
    exif[0x010F], exif[0x0110] = "Canon", "Canon EOS R6"
    exif.get_ifd(0x8825).update({1: "N", 2: (51.0, 30.0, 0.0)})
    xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/>secret-xmp</x:xmpmeta>'
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    buf = io.BytesIO()
    Image.new("RGB", (96, 64), "#336699").save(buf, "JPEG", exif=exif, xmp=xmp, icc_profile=icc)
    raw = buf.getvalue()
    value = b"secret-iptc"
    record = b"\x1c\x02\x78" + struct.pack(">H", len(value)) + value
    resource = b"8BIM\x04\x04\x00\x00" + struct.pack(">I", len(record)) + record + b"\x00" * (len(record) & 1)
    iptc = b"Photoshop 3.0\x00" + resource
    app13 = b"\xff\xed" + struct.pack(">H", len(iptc) + 2) + iptc
    return raw[:2] + app13 + raw[2:]


def test_renditions_carry_no_source_metadata(tmp_path) -> None:
    raw = _tagged_jpeg()
    with Image.open(io.BytesIO(raw)) as src:  # the source really does carry all of it
        assert src.getexif() and "xmp" in src.info and "icc_profile" in src.info
    assert b"secret-i" in raw
    with Image.open(io.BytesIO(raw)) as src:  # and the IPTC block parses whole
        assert IptcImagePlugin.getiptcinfo(src) == {(2, 120): b"secret-iptc"}

    rendition = render(raw, tmp_path, "abc123")
    files = sorted((tmp_path / "images").glob("*.webp")) + sorted((tmp_path / "thumbs").rglob("*.webp"))
    assert len(files) >= 2
    for path in files:
        data = path.read_bytes()
        assert not {b"EXIF", b"XMP ", b"ICCP"} & set(_webp_chunks(data)), path
        for marker in (b"Canon", b"secret-xmp", b"secret-i", b"Photoshop"):
            assert marker not in data, (path, marker)
        with Image.open(path) as img:
            assert not {"exif", "xmp", "icc_profile"} & set(img.info), path
    assert "gps" not in json.dumps(rendition.exif).lower()


def test_bake_imports_no_lens_server_internals_and_only_cortex_blobs() -> None:
    allowed_cortex = {"argus_cortex.store"}
    offenders = []
    for path in sorted(SRC.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
            for name in names:
                if name == "argus_lens.server" or name.startswith(("argus_lens.server.", "argus_lens.cli")):
                    offenders.append(f"{path.name}: {name}")
                if name.startswith("argus_cortex") and not any(
                    name == ok or name.startswith(f"{ok}.") for ok in allowed_cortex
                ):
                    offenders.append(f"{path.name}: {name}")
    assert offenders == []


def test_the_fixture_stays_obviously_synthetic() -> None:
    for record in fixture_records():
        assert record.provenance["source"] == "synthetic fixture"
        assert record.uri.startswith("fixture://")
    index = json.loads((COMMITTED_FIXTURE / "index.json").read_text(encoding="utf-8"))
    assert index["source"] == "fixture"
    assert index["photos"] and all(p["provenance"]["source"] == "synthetic fixture" for p in index["photos"])


def test_fixture_check_ignores_run_noise_and_flags_real_drift(tmp_path) -> None:
    fresh = tmp_path / "fresh"
    build_index(fixture_records(), fresh, source="fixture")
    committed = tmp_path / "committed"
    shutil.copytree(fresh, committed)
    assert compare(fresh, committed) == []

    index_path = committed / "index.json"
    index = json.loads(index_path.read_text())
    index["generated_at"] = "2000-01-01T00:00:00+00:00"
    index["photos"][0]["caption"]["caption_variants"]["training"] = "shuffled, differently"
    index_path.write_text(json.dumps(index))
    assert compare(fresh, committed) == []

    index["photos"][0]["caption"]["final_caption"] = "stale"
    index_path.write_text(json.dumps(index))
    (committed / "thumbs" / "orphan.webp").write_bytes(b"old")
    problems = compare(fresh, committed)
    assert any("index.json differs" in p for p in problems)
    assert "not written by the bake: thumbs/orphan.webp" in problems


def test_a_thumbnail_width_the_bake_no_longer_writes_is_pruned(tmp_path) -> None:
    build_index(fixture_records(), tmp_path, source="fixture")
    index = json.loads((tmp_path / "index.json").read_text())
    photo = next(p for p in index["photos"] if not any("/360/" in t["src"] for t in p["thumbs"]))
    stale = tmp_path / "thumbs" / "360" / f"{photo['id']}.webp"
    stale.parent.mkdir(parents=True, exist_ok=True)
    stale.write_bytes(b"old")
    build_index(fixture_records(), tmp_path, source="fixture")
    assert not stale.exists()
    index = json.loads((tmp_path / "index.json").read_text())  # the rebuilt index, not the first one
    rebuilt = next(p for p in index["photos"] if p["id"] == photo["id"])
    assert not any("/360/" in t["src"] for t in rebuilt["thumbs"])
    listed = [t["src"] for p in index["photos"] for t in p["thumbs"]]
    assert all((tmp_path / src).is_file() for src in listed)


def test_the_recorded_caption_is_published_even_when_recomposition_disagrees(tmp_path) -> None:
    record = next(iter(fixture_records()))
    recorded = {**record.caption, "final_caption": "an older lens wrote this"}
    build_index([dataclasses.replace(record, caption=recorded)], tmp_path, source="fixture")
    photo = json.loads((tmp_path / "index.json").read_text())["photos"][0]
    assert photo["caption"]["final_caption"] == "an older lens wrote this"
    assert photo["caption"]["caption_variants"] == recorded["caption_variants"]
    assert photo["explain"]["drift"] is True
