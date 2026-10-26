from __future__ import annotations

import io
import json
import sys
import types

from PIL import Image

from lightbox_bake.cli import main
from lightbox_bake.exif import read_exif
from lightbox_bake.explain import CATEGORIES, explain
from lightbox_bake.fixture import SCENES, fixture_records
from lightbox_bake.images import THUMB_MAX, render
from lightbox_bake.index import build_index
from lightbox_bake.sources import SourceRecord, tape_records


def _jpeg(exif: Image.Exif | None = None) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), "#336699").save(buf, "JPEG", exif=exif or Image.Exif())
    return buf.getvalue()


def test_exif_is_normalised_and_never_includes_gps() -> None:
    exif = Image.Exif()
    exif[0x010F], exif[0x0110] = "Canon", "Canon EOS R6"
    exif.get_ifd(0x8769).update(
        {0x920A: 50.0, 0x829D: 2.8, 0x829A: 1 / 320, 0x8827: 800, 0x9003: "2025:09:21 07:05:44"}
    )
    exif.get_ifd(0x8825).update({1: "N", 2: (51.0, 30.0, 0.0)})  # GPS IFD
    with Image.open(io.BytesIO(_jpeg(exif))) as img:
        out = read_exif(img)
    assert out == {
        "camera": "Canon EOS R6",  # make not repeated when the model already starts with it
        "focal_length_mm": 50.0,
        "aperture": 2.8,
        "exposure_s": 1 / 320,
        "shutter": "1/320s",
        "iso": 800,
        "taken_at": "2025-09-21T07:05:44",
    }
    assert not any("gps" in k.lower() for k in out)


def test_exif_absent_is_empty() -> None:
    with Image.open(io.BytesIO(_jpeg())) as img:
        assert read_exif(img) == {}


def test_explain_facets_compare_and_drift() -> None:
    record = next(fixture_records())  # beach sunset: hybrid, one person
    derived = explain(record.caption)
    assert derived["explain"]["drift"] is False
    assert set(derived["compare"]) == {"tags", "prose", "hybrid"}
    assert derived["compare"]["hybrid"]["final_caption"] == record.caption["final_caption"]
    assert "red dress" in derived["facets"]["wardrobe"]
    assert derived["facets"]["people"] == ["one person"]
    assert set(derived["facets"]) <= {*CATEGORIES, "people", "detail"}

    drifted = explain({**record.caption, "final_caption": "an older lens wrote this"})
    assert drifted["explain"]["drift"] is True


def test_unclassified_ordinary_tags_are_filterable_and_sexual_tags_are_not() -> None:
    caption = {
        "final_caption": "",
        "raw_tags": "1girl, solo, carpet, barefoot, open_mouth, kneehighs, pussy, loli, photorealistic, wet ground",
        "raw_prose": "",
        "backend_name": "wd14",
    }
    facets = explain(caption)["facets"]
    assert "carpet" in facets["setting"]
    assert "barefoot" in facets["pose_composition"]
    assert "open mouth" in facets["identity"]
    assert "kneehighs" in facets["wardrobe"]
    assert "wet ground" in facets["detail"]
    listed = {term for terms in facets.values() for term in terms}
    assert "pussy" not in listed
    assert "loli" not in listed
    assert "photorealistic" not in listed


def test_single_source_backend_has_no_compare() -> None:
    by_backend = {r.caption["backend_name"]: r for r in fixture_records()}
    assert explain(by_backend["wd14"].caption)["compare"] == {}
    assert explain(by_backend["florence2"].caption)["compare"] == {}


def test_build_index_writes_renditions_and_prunes(tmp_path) -> None:
    stale = tmp_path / "thumbs" / "deadbeefdeadbeef.webp"
    stale.parent.mkdir(parents=True)
    stale.write_bytes(b"old")

    records = list(fixture_records())
    missing = SourceRecord(uri="file:///nope.jpg", caption=records[0].caption, load_bytes=lambda: None)
    broken = SourceRecord(uri="file:///broken.jpg", caption=records[0].caption, load_bytes=lambda: b"not an image")
    stats = build_index([*records, records[0], missing, broken], tmp_path, source="fixture")

    assert stats.baked == len(SCENES)
    assert len(stats.skipped) == 3  # the duplicate, the missing bytes, the unreadable image
    index = json.loads((tmp_path / "index.json").read_text())
    assert index["version"] == "1.0" and index["source"] == "fixture"
    assert index["categories"] == CATEGORIES
    photo = index["photos"][0]
    for key in ("id", "image", "thumb", "width", "height", "color", "caption", "explain", "compare", "facets", "exif"):
        assert key in photo
    assert (tmp_path / photo["image"]).is_file() and (tmp_path / photo["thumb"]).is_file()
    xmp = (tmp_path / photo["xmp"]).read_text()
    assert "red dress" in xmp and photo["caption"]["final_caption"] in xmp
    assert max(photo["width"], photo["height"]) <= 2048
    assert "queue" not in index and not (tmp_path / "status.json").exists()
    assert not stale.exists()


def test_thumbnail_long_side_is_capped_below_the_detail_image(tmp_path) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (1600, 900), "#224466").save(buf, "JPEG")
    rendition = render(buf.getvalue(), tmp_path, "abcdabcdabcdabcd")
    with Image.open(tmp_path / rendition.thumb) as thumb:
        assert max(thumb.size) <= THUMB_MAX < 1600
    with Image.open(tmp_path / rendition.image) as full:
        assert max(full.size) == 1600


def test_tape_records_maps_lineage_rows(monkeypatch, tmp_path) -> None:
    img = tmp_path / "a.jpg"
    img.write_bytes(_jpeg())
    row = (str(img), "ab" * 32, {"license": "CC0-1.0", "author": "Ada", "internal": "x"},
           "final", {"identity": "final"}, "1girl, red dress", "A woman.", "hybrid",
           {"target_category": "wardrobe"}, 2)  # fmt: skip
    executed = {}

    class Cursor:
        def execute(self, sql, params):
            executed["sql"], executed["params"] = sql, params

        def fetchall(self):
            return [row]

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def cursor(self):
            return self

        execute, fetchall = Cursor.execute, Cursor.fetchall

    class NullBlobs:
        def get(self, key):
            return None

    monkeypatch.setitem(sys.modules, "psycopg", types.SimpleNamespace(connect=lambda url: Conn()))
    monkeypatch.setattr("argus_cortex.store.open_blob_store", lambda: NullBlobs())

    [record] = tape_records("postgresql://x", dataset="demo", limit=5)
    assert "dataset_membership" in executed["sql"] and executed["params"] == ["demo"]
    assert executed["sql"].rstrip().endswith("LIMIT 5")
    assert record.provenance == {"license": "CC0-1.0", "author": "Ada"}
    assert record.caption["selected_category"] == "wardrobe"
    assert record.caption["caption_variants"] == {"identity": "final"}
    assert record.load_bytes() == img.read_bytes()  # blob store miss falls back to the local uri


def test_cli_fixture(tmp_path, capsys) -> None:
    assert main(["fixture", "--out", str(tmp_path)]) == 0
    assert f"baked {len(SCENES)} photos" in capsys.readouterr().out
