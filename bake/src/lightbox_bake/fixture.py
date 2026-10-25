"""A synthetic fixture so the gallery runs (and is tested) without the tape.

The raw model output is hand-written in WD14-tag / Florence-prose style, but the
captions are produced by **lens's real assembly pipeline**, so explain/compare/
facet data is genuine pipeline output. The images are drawn placeholders with
embedded EXIF (exercising the same reader real photos go through), and every
record is labelled ``synthetic fixture`` in its provenance.
"""

from __future__ import annotations

import dataclasses
import io
from collections.abc import Iterator
from dataclasses import dataclass

from argus_lens.assembly.composer import compose_caption_result
from PIL import Image, ImageDraw

from lightbox_bake.explain import target_profile
from lightbox_bake.sources import SourceRecord


@dataclass(frozen=True)
class Scene:
    """One fixture photo: raw model output plus how to draw its placeholder."""

    slug: str
    tags: str
    prose: str
    sky: tuple[str, str]  # top, horizon
    ground: str
    people: int = 1
    wardrobe: str = "#d9d9d9"
    portrait: bool = False
    sun: str | None = None
    exif: tuple[str, str, float, float, str, int, str] = (
        "FUJIFILM",
        "X-T5",
        33.0,
        2.0,
        "1/250",
        400,
        "2025:06:14 19:42:10",
    )
    backend: str = "hybrid"


SCENES: tuple[Scene, ...] = (
    Scene(
        "beach-sunset",
        "1girl, solo, long hair, brown hair, red dress, standing, outdoors, beach, sunset, smile, looking at viewer, ocean, sky, cloud",
        "A photograph of a smiling woman with long brown hair wearing a red dress, standing on a sandy beach at sunset with waves behind her.",
        ("#f59e9e", "#f7b267"),
        "#e3c08d",
        wardrobe="#c0392b",
        sun="#ffd27a",
        portrait=True,
    ),
    Scene(
        "neon-street",
        "1boy, solo, short hair, black hair, leather jacket, jeans, walking, night, city, street, neon lights, rain, wet ground",
        "A man in a black leather jacket walks down a rain-soaked city street at night, lit by pink and blue neon signs.",
        ("#0b1020", "#3b1d5a"),
        "#1e2742",
        wardrobe="#111111",
        exif=("SONY", "ILCE-7M4", 35.0, 1.4, "1/60", 3200, "2025:11:02 22:15:31"),
    ),
    Scene(
        "forest-hike",
        "1girl, solo, ponytail, blonde hair, hiking, backpack, jacket, boots, walking, forest, tree, fog, morning, soft lighting",
        "A woman with a blonde ponytail hikes along a misty forest trail in the early morning, wearing a green jacket and a backpack.",
        ("#c9d6c3", "#e6ece1"),
        "#3f5a3a",
        wardrobe="#4c7a46",
        portrait=True,
        exif=("Canon", "Canon EOS R6", 50.0, 2.8, "1/320", 800, "2025:09:21 07:05:44"),
    ),
    Scene(
        "studio-portrait",
        "1boy, solo, beard, short hair, black turtleneck, sitting, simple background, grey background, rim lighting, upper body, looking at viewer",
        "A studio portrait of a bearded man in a black turtleneck sitting against a plain grey backdrop, rim light outlining his shoulders.",
        ("#3a3f4b", "#565c6b"),
        "#2b2f38",
        wardrobe="#0d0d0d",
        portrait=True,
        exif=("NIKON CORPORATION", "NIKON Z 6_2", 85.0, 1.8, "1/200", 100, "2025:03:08 14:30:00"),
    ),
    Scene(
        "cafe-conversation",
        "2girls, multiple girls, sitting, table, cafe, indoors, coffee cup, window, talking, smile, sweater, daylight",
        "Two women chat across a small table in a sunlit cafe, coffee cups between them, soft daylight falling through the window.",
        ("#e8d8c3", "#f3eadb"),
        "#8a6a4f",
        people=2,
        wardrobe="#b48c6e",
        exif=("FUJIFILM", "X100VI", 23.0, 2.0, "1/125", 640, "2025:10:12 10:48:02"),
    ),
    Scene(
        "alpine-lake",
        "no humans, scenery, mountain, lake, reflection, outdoors, sky, cloud, golden hour, tree, water",
        "A still alpine lake reflects snow-capped mountains and pine trees in warm golden-hour light, with no people in the scene.",
        ("#f7b267", "#ffd9a0"),
        "#2f5d62",
        people=0,
        sun="#ffe2a8",
        exif=("Canon", "Canon EOS R5", 16.0, 8.0, "1/100", 100, "2025:08:03 20:11:57"),
    ),
    Scene(
        "home-kitchen",
        "1boy, solo, apron, cooking, kitchen, indoors, cutting board, knife, vegetables, standing, warm lighting, t-shirt",
        "A man in an apron chops vegetables on a wooden cutting board in a warmly lit home kitchen.",
        ("#f1d3a8", "#f7e3c4"),
        "#9b6b43",
        wardrobe="#e9e2d0",
        exif=("Apple", "iPhone 15 Pro", 6.8, 1.8, "1/60", 500, "2025:12:19 18:22:40"),
    ),
    Scene(
        "snow-park",
        "1girl, solo, winter coat, scarf, beanie, running, snow, outdoors, park, tree, overcast, smile",
        "A girl in a winter coat, scarf and knitted beanie runs through a snowy park under an overcast sky.",
        ("#d7dde4", "#eef1f4"),
        "#f4f6f8",
        wardrobe="#d97706",
        portrait=True,
        exif=("SONY", "ILCE-6700", 70.0, 4.0, "1/1000", 200, "2026:01:24 11:03:18"),
    ),
    Scene(
        "rooftop-friends",
        "multiple boys, multiple girls, group, laughing, rooftop, string lights, evening, city, outdoors, drink, standing",
        "A group of friends laugh together on a city rooftop in the evening under strings of warm fairy lights.",
        ("#293256", "#8b5cf6"),
        "#1e2742",
        people=3,
        wardrobe="#f472b6",
        exif=("FUJIFILM", "X-T5", 18.0, 1.4, "1/80", 2500, "2025:07:19 21:37:05"),
    ),
    Scene(
        "desert-road",
        "no humans, car, vintage car, road, desert, outdoors, sky, day, sunlight, shadow",
        "A vintage car is parked on an empty desert road under harsh midday sunlight casting short dark shadows.",
        ("#7cc4e8", "#cbe8f5"),
        "#d9a066",
        people=0,
        sun="#fff6d5",
        exif=("Leica Camera AG", "LEICA Q3", 28.0, 5.6, "1/2000", 100, "2025:05:30 12:40:11"),
        backend="wd14",
    ),
    Scene(
        "library-reader",
        "1girl, solo, glasses, cardigan, reading, book, sitting, library, bookshelf, indoors, lamp, warm lighting",
        "A young woman in glasses and a cardigan sits reading a book in a quiet library, lit by a green desk lamp.",
        ("#5b4636", "#7a5f48"),
        "#3b2c22",
        wardrobe="#8f6f4e",
        exif=("Panasonic", "DC-S5M2", 50.0, 1.8, "1/100", 1600, "2025:11:28 16:55:49"),
        backend="florence2",
    ),
    Scene(
        "blue-hour-umbrella",
        "1girl, solo, trench coat, umbrella, holding umbrella, standing, rain, street, blue hour, city, outdoors",
        "A woman in a beige trench coat stands holding an umbrella on a rainy street during the blue hour.",
        ("#1e3a5f", "#3b6a9b"),
        "#203047",
        wardrobe="#c8b38a",
        portrait=True,
        exif=("OM Digital Solutions", "OM-1MarkII", 25.0, 1.2, "1/50", 3200, "2025:10:30 18:04:26"),
    ),
)


def _draw(scene: Scene) -> bytes:
    w, h = (1067, 1600) if scene.portrait else (1600, 1067)
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    top, horizon = (Image.new("RGB", (1, 1), c).getpixel((0, 0)) for c in scene.sky)
    ground_y = int(h * 0.68)
    for y in range(ground_y):
        t = y / ground_y
        draw.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, horizon, strict=True)))
    draw.rectangle([0, ground_y, w, h], fill=scene.ground)
    if scene.sun:
        r = int(min(w, h) * 0.09)
        cx, cy = int(w * 0.72), int(ground_y * 0.55)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=scene.sun)
    unit = min(w, h) / 10
    for i in range(scene.people):
        cx = w * (i + 1) / (scene.people + 1)
        foot = ground_y + unit * 1.2
        draw.rounded_rectangle(
            [cx - unit * 0.55, foot - unit * 3.0, cx + unit * 0.55, foot], radius=int(unit * 0.4), fill=scene.wardrobe
        )
        draw.ellipse([cx - unit * 0.42, foot - unit * 3.9, cx + unit * 0.42, foot - unit * 3.06], fill="#e9c7a8")
    draw.text((24, h - 40), f"synthetic fixture · {scene.slug}", fill="#ffffff")

    make, model, focal, fnum, shutter, iso, taken = scene.exif
    exif = Image.Exif()
    exif[0x010F], exif[0x0110], exif[0x0131] = make, model, "argus-lightbox fixture"
    num, den = (int(p) for p in shutter.split("/")) if "/" in shutter else (int(shutter), 1)
    sub = exif.get_ifd(0x8769)
    sub.update({0x920A: focal, 0x829D: fnum, 0x829A: num / den, 0x8827: iso, 0x9003: taken})
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88, exif=exif)
    return buf.getvalue()


def fixture_records() -> Iterator[SourceRecord]:
    """Yield the fixture scenes, captioned by lens's real assembly pipeline."""
    profile = {"target_style": "photo", "target_category": "identity", "target_backend": "sdxl"}
    for scene in SCENES:
        tags = "" if scene.backend == "florence2" else scene.tags
        prose = "" if scene.backend == "wd14" else scene.prose
        result = compose_caption_result(
            trigger_word="", tags=tags, prose=prose, target_profile=target_profile(profile), backend_name=scene.backend
        )
        caption = dataclasses.asdict(result)
        caption = {
            k: caption[k]
            for k in ("final_caption", "caption_variants", "selected_category", "raw_tags", "raw_prose", "backend_name")
        }
        yield SourceRecord(
            uri=f"fixture://{scene.slug}",
            caption={**caption, "profile": profile, "version": 1},
            load_bytes=lambda scene=scene: _draw(scene),
            provenance={"source": "synthetic fixture", "license": "CC0-1.0", "title": scene.slug.replace("-", " ")},
        )
