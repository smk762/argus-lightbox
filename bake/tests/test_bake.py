from __future__ import annotations

import hashlib
import io
import json
import shutil
import sys
import types

from PIL import Image

from lightbox_bake.cli import main
from lightbox_bake.exif import read_exif
from lightbox_bake.explain import CATEGORIES, explain
from lightbox_bake.fixture import SCENES, fixture_records
from lightbox_bake.images import THUMB_MAX, THUMB_WIDTHS, render
from lightbox_bake.index import CaptionChoiceError, build_index, choose_final_caption, regenerate_thumbs, write_gallery
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

    rewritten = explain(
        {
            **record.caption,
            "final_caption": "a checked rewrite of the assembled caption",
            "refine": {"model": "qwen3:8b", "accepted": [record.caption["selected_category"]]},
        }
    )
    assert rewritten["explain"]["drift"] is False
    assert rewritten["explain"]["compaction_notes"][-1] == (
        f"Refined {record.caption['selected_category']} with qwen3:8b."
    )


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


def test_facet_lists_json_overrides_and_a_missing_file_uses_the_example(tmp_path, monkeypatch) -> None:
    caption = {
        "final_caption": "",
        "raw_tags": "carpet, wet ground, photorealistic, pussy, loli",
        "raw_prose": "",
        "backend_name": "wd14",
    }
    custom = tmp_path / "lists.json"
    custom.write_text(
        json.dumps(
            {
                "meta_tags": ["carpet"],
                "blocked_tags": [],
                "blocked_parts": ["pussy", "loli"],
                "extra_category": {"wet_ground": "lighting"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("FACET_LISTS_JSON", str(custom))
    facets = explain(caption)["facets"]
    listed = {term for terms in facets.values() for term in terms}
    assert "wet ground" in facets["lighting"]
    assert "carpet" not in listed
    assert "photorealistic" in facets["detail"]
    assert "pussy" not in listed and "loli" not in listed

    monkeypatch.setenv("FACET_LISTS_JSON", str(tmp_path / "missing.json"))
    fallback = explain(caption)["facets"]
    assert "carpet" in fallback["setting"]
    assert "wet ground" in fallback["detail"]
    assert "photorealistic" not in {term for terms in fallback.values() for term in terms}


def test_single_source_backend_has_no_compare() -> None:
    by_backend = {r.caption["backend_name"]: r for r in fixture_records()}
    assert explain(by_backend["wd14"].caption)["compare"] == {}
    assert explain(by_backend["florence2"].caption)["compare"] == {}


def test_build_index_writes_renditions_and_prunes(tmp_path) -> None:
    stale = tmp_path / "thumbs" / "deadbeefdeadbeef.webp"
    stale_small = tmp_path / "thumbs" / "240" / "deadbeefdeadbeef.webp"
    stale_small.parent.mkdir(parents=True)
    stale.write_bytes(b"old")
    stale_small.write_bytes(b"old")

    records = list(fixture_records())
    missing = SourceRecord(uri="file:///nope.jpg", caption=records[0].caption, load_bytes=lambda: None)
    broken = SourceRecord(uri="file:///broken.jpg", caption=records[0].caption, load_bytes=lambda: b"not an image")
    stats = build_index([*records, records[0], missing, broken], tmp_path, source="fixture")

    assert stats.baked == len(SCENES)
    assert len(stats.skipped) == 3  # the duplicate, the missing bytes, the unreadable image
    index = json.loads((tmp_path / "index.json").read_text())
    assert index["version"] == "1.2" and index["source"] == "fixture"
    assert index["categories"] == CATEGORIES
    photo = index["photos"][0]
    for key in ("id", "image", "thumb", "width", "height", "color", "caption", "explain", "compare", "facets", "exif"):
        assert key in photo
    assert (tmp_path / photo["image"]).is_file() and (tmp_path / photo["thumb"]).is_file()
    xmp = (tmp_path / photo["xmp"]).read_text()
    assert "red dress" in xmp and photo["caption"]["final_caption"] in xmp
    assert max(photo["width"], photo["height"]) <= 2048
    assert "queue" not in index and not (tmp_path / "status.json").exists()
    assert not stale.exists() and not stale_small.exists()
    assert photo["thumbs"][-1]["src"] == photo["thumb"]
    for entry in photo["thumbs"]:
        with Image.open(tmp_path / entry["src"]) as thumb:
            assert thumb.width == entry["width"]


def test_thumbnail_long_side_is_capped_below_the_detail_image(tmp_path) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (1600, 900), "#224466").save(buf, "JPEG")
    rendition = render(buf.getvalue(), tmp_path, "abcdabcdabcdabcd")
    with Image.open(tmp_path / rendition.thumb) as thumb:
        assert max(thumb.size) <= THUMB_MAX < 1600
    with Image.open(tmp_path / rendition.image) as full:
        assert max(full.size) == 1600


def test_narrower_thumbnails_are_written_by_width(tmp_path) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (1600, 900), "#224466").save(buf, "JPEG")
    landscape = render(buf.getvalue(), tmp_path, "abcdabcdabcdabcd")
    assert [t["width"] for t in landscape.thumbs] == [*THUMB_WIDTHS, THUMB_MAX]
    assert landscape.thumbs[0]["src"] == f"thumbs/{THUMB_WIDTHS[0]}/abcdabcdabcdabcd.webp"
    with Image.open(tmp_path / landscape.thumbs[0]["src"]) as small:
        assert small.size == (240, 135)

    buf = io.BytesIO()
    Image.new("RGB", (900, 1600), "#224466").save(buf, "JPEG")
    portrait = render(buf.getvalue(), tmp_path, "ef01ef01ef01ef01")
    # The 480 thumbnail of a portrait photo is 270 wide, so only narrower widths are added.
    assert [t["width"] for t in portrait.thumbs] == [240, 270]


def test_regenerate_thumbs_keeps_everything_else(tmp_path) -> None:
    blobs = tmp_path / "blobs"
    blobs.mkdir()
    records = []
    for i, colour in enumerate(("#224466", "#664422")):
        buf = io.BytesIO()
        Image.new("RGB", (1200 - i * 400, 800), colour).save(buf, "JPEG")
        raw = buf.getvalue()
        sha = hashlib.sha256(raw).hexdigest()
        (blobs / sha).write_bytes(raw)
        base = next(iter(fixture_records()))
        records.append(SourceRecord(uri=f"file:///{i}.jpg", caption=base.caption, load_bytes=lambda raw=raw: raw))
    out = tmp_path / "out"
    build_index(records, out, source="tape")
    index = json.loads((out / "index.json").read_text())
    # An index from before 1.2: no thumbs, no narrow files.
    index["version"] = "1.1"
    for photo in index["photos"]:
        del photo["thumbs"]
    (out / "index.json").write_text(json.dumps(index))
    shutil.rmtree(out / "thumbs" / "240")
    shutil.rmtree(out / "thumbs" / "360")
    xmp_before = {p.name: p.read_bytes() for p in (out / "xmp").iterdir()}
    thumb_before = {p.name: p.read_bytes() for p in (out / "thumbs").glob("*.webp")}

    (blobs / index["photos"][1]["sha256"]).write_bytes(b"tampered")
    updated, skipped = regenerate_thumbs(out, blobs)

    assert updated == 1 and len(skipped) == 1
    after = json.loads((out / "index.json").read_text())
    assert after["version"] == "1.2" and after["generated_at"] == index["generated_at"]
    first, second = after["photos"]
    assert list(first)[: list(first).index("thumbs") + 1][-2:] == ["thumb", "thumbs"]
    assert [t["width"] for t in first["thumbs"]] == [240, 360, 480]
    assert all((out / t["src"]).is_file() for t in first["thumbs"])
    assert "thumbs" not in second
    stripped = [{k: v for k, v in p.items() if k != "thumbs"} for p in after["photos"]]
    assert stripped == index["photos"]
    assert {p.name: p.read_bytes() for p in (out / "xmp").iterdir()} == xmp_before
    assert {p.name: p.read_bytes() for p in (out / "thumbs").glob("*.webp")} == thumb_before


def test_tape_records_maps_lineage_rows(monkeypatch, tmp_path) -> None:
    img = tmp_path / "a.jpg"
    img.write_bytes(_jpeg())
    row = (str(img), "ab" * 32, {"license": "CC0-1.0", "author": "Ada", "internal": "x"},
           "final", {"identity": "final"}, "1girl, red dress", "A woman.", "hybrid",
           {"target_category": "wardrobe"}, 2,
           {"refine": {"model": "qwen3:4b-instruct", "accepted": ["wardrobe"], "extra": 1}},
           {"prose_prompt": "straightforward"})  # fmt: skip
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
    assert record.caption["refine"] == {"model": "qwen3:4b-instruct", "accepted": ["wardrobe"]}  # from caption.metadata
    assert record.load_bytes() == img.read_bytes()  # blob store miss falls back to the local uri
    assert record.params == {"prose_prompt": "straightforward"}


def test_build_index_records_params_only_when_every_photo_agrees(tmp_path) -> None:
    records = list(fixture_records())[:2]
    for record in records:
        record.params = {"prose_model": "qwen3-vl:2b-instruct", "prose_prompt": "straightforward"}
    build_index(records, tmp_path, source="tape")
    index = json.loads((tmp_path / "index.json").read_text())
    assert index["caption_params"] == {"prose_model": "qwen3-vl:2b-instruct", "prose_prompt": "straightforward"}

    records[1].params = {"prose_model": "qwen3-vl:2b-instruct", "prose_prompt": "detailed"}
    build_index(records, tmp_path, source="tape")
    assert "caption_params" not in json.loads((tmp_path / "index.json").read_text())


def test_provenance_maps_quarry_spelling() -> None:
    from lightbox_bake.sources import _provenance

    meta = {"licence": "PD", "attribution": "F. Schmutzer", "title": "Einstein.jpg", "rel_path": "x/y.jpg"}
    uri = "https://commons.wikimedia.org/wiki/File:Einstein.jpg"
    assert _provenance(meta, uri) == {
        "license": "PD",
        "author": "F. Schmutzer",
        "source_url": uri,
        "title": "Einstein.jpg",
    }
    assert _provenance({"license": "CC0", "licence": "PD"}, "/local/a.jpg") == {"license": "CC0"}
    assert _provenance({"attribution": "EN NOIR &amp; BLANC"}, "/a.jpg") == {"author": "EN NOIR & BLANC"}


def _gallery_photo(photo_id: str, caption: dict) -> dict:
    return {
        "id": photo_id,
        "sha256": photo_id + ("ab" * 24),
        "image": f"images/{photo_id}.webp",
        "thumb": f"thumbs/{photo_id}.webp",
        "xmp": f"xmp/{photo_id}.xmp",
        "width": 4,
        "height": 3,
        "color": "#000000",
        "caption": caption,
        "explain": {},
        "compare": {},
        "facets": {},
        "exif": {},
        "provenance": {},
    }


def test_choose_final_caption_promotes_an_existing_variant(tmp_path) -> None:
    record = next(item for item in fixture_records() if item.caption["caption_variants"].get("pose_composition"))
    pose = record.caption["caption_variants"]["pose_composition"]
    chosen_id = "abc123def4567890"
    other_id = "0123456789abcdef"
    other = {**record.caption, "final_caption": "leave this", "selected_category": "identity"}
    write_gallery(
        tmp_path,
        [_gallery_photo(chosen_id, record.caption), _gallery_photo(other_id, other)],
        source="folder",
        queue=0,
    )

    result = choose_final_caption(tmp_path, [chosen_id, "deadbeefdeadbeef"], "pose_composition")

    assert result["updated"] == [chosen_id]
    assert result["skipped"] == [{"id": "deadbeefdeadbeef", "reason": "not in this gallery"}]
    saved = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    updated = next(photo for photo in saved["photos"] if photo["id"] == chosen_id)
    untouched = next(photo for photo in saved["photos"] if photo["id"] == other_id)
    assert updated["caption"]["final_caption"] == pose
    assert updated["caption"]["selected_category"] == "pose_composition"
    assert updated["caption"]["profile"]["target_category"] == "pose_composition"
    assert untouched["caption"]["final_caption"] == "leave this"
    assert pose in (tmp_path / "xmp" / f"{chosen_id}.xmp").read_text(encoding="utf-8")


def test_choose_final_caption_refuses_a_live_bake_and_an_unknown_option(tmp_path) -> None:
    record = next(iter(fixture_records()))
    photo_id = "abc123def4567890"
    write_gallery(tmp_path, [_gallery_photo(photo_id, record.caption)], source="folder", queue=2)
    try:
        choose_final_caption(tmp_path, [photo_id], "setting")
    except CaptionChoiceError as exc:
        assert exc.status == 409
    else:
        raise AssertionError("expected the live bake to refuse the change")
    saved = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert saved["photos"][0]["caption"]["final_caption"] == record.caption["final_caption"]

    write_gallery(tmp_path, [_gallery_photo(photo_id, record.caption)], source="folder", queue=0)
    try:
        choose_final_caption(tmp_path, [photo_id], "not-a-category")
    except CaptionChoiceError as exc:
        assert exc.status == 400
    else:
        raise AssertionError("expected an unknown option to be refused")


def test_cli_fixture(tmp_path, capsys) -> None:
    assert main(["fixture", "--out", str(tmp_path)]) == 0
    assert f"baked {len(SCENES)} photos" in capsys.readouterr().out
