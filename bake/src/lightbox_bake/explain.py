"""Re-run lens's assembly on the recorded raw output — CPU only, no model.

The tape stores each caption's final text, variants, and raw model output, but
not the intermediate assembly state. ``compose_caption_result`` rebuilds that
deterministically from the raw tags/prose, which gives the demo:

* **explain** — per-category buckets (tags vs prose), compaction notes and the
  headcount estimate, for the "how this caption was built" panel;
* **compare** — the same raw output assembled tags-only, prose-only and hybrid,
  which shows the assembly (not the model) doing the work;
* **facets** — the classified tag fragments the gallery filters on, plus
  unclassified tags that are not rating, sexual, or minor-related. Known
  gaps in the hint list are filed under the matching category; the rest
  go to a ``detail`` group.

The *recorded* caption stays the source of truth for what is displayed; if the
pinned lens version would now assemble a different ``final_caption``, the photo
is flagged with ``explain.drift`` rather than silently re-captioned.
"""

from __future__ import annotations

from typing import Any

from argus_lens.assembly.composer import compose_caption_result
from argus_lens.types import DEFAULT_CATEGORY_CONFIGS, CaptionTargetProfile

CATEGORIES: list[str] = [c.name for c in DEFAULT_CATEGORY_CONFIGS]
_PROFILE_FIELDS = ("target_style", "target_category", "target_backend", "checkpoint")


def target_profile(profile: dict[str, Any] | None) -> CaptionTargetProfile:
    """Build a lens ``CaptionTargetProfile`` from a recorded profile dict (unknown keys ignored)."""
    profile = profile or {}
    return CaptionTargetProfile(**{k: profile[k] for k in _PROFILE_FIELDS if profile.get(k) is not None})


def _compose(tags: str, prose: str, profile: CaptionTargetProfile, backend: str):
    return compose_caption_result(trigger_word="", tags=tags, prose=prose, target_profile=profile, backend_name=backend)


# Quality and source markers. They describe the file, not the photo.
_META_TAGS = frozenset(
    {
        "photorealistic",
        "photo",
        "anime",
        "sketch",
        "monochrome",
        "greyscale",
        "grayscale",
        "watermark",
        "signature",
        "username",
        "highres",
        "absurdres",
        "commentary",
    }
)

# Whole tags whose individual words would otherwise look ordinary.
_BLOCKED_TAGS = frozenset(
    {
        "spread_legs",
        "all_fours",
        "flat_chest",
        "sex_toy",
        "object_insertion",
        "female_masturbation",
        "completely_nude",
        "vaginal_object_insertion",
    }
)

# A tag is dropped when any of its words is in this set.
_BLOCKED_PARTS = frozenset(
    {
        "loli",
        "shota",
        "nude",
        "nudity",
        "topless",
        "bottomless",
        "nipple",
        "nipples",
        "areola",
        "breast",
        "breasts",
        "pussy",
        "vagina",
        "vaginal",
        "penis",
        "anus",
        "anal",
        "clitoris",
        "labia",
        "testicles",
        "scrotum",
        "pubic",
        "genital",
        "genitals",
        "sex",
        "sexual",
        "masturbation",
        "dildo",
        "vibrator",
        "uncensored",
        "censored",
        "penetration",
        "insertion",
        "cum",
        "semen",
        "erection",
        "orgasm",
    }
)

# Non-sexual gaps in lens's hint lists. The key is the tag with spaces as underscores.
_EXTRA_CATEGORY = {
    "open_mouth": "identity",
    "scar": "identity",
    "wrinkles": "identity",
    "asian": "identity",
    "navel": "identity",
    "feet": "identity",
    "toes": "identity",
    "teen": "identity",
    "barefoot": "pose_composition",
    "kneehighs": "wardrobe",
    "underwear": "wardrobe",
    "panties": "wardrobe",
    "midriff": "wardrobe",
    "carpet": "setting",
    "scenery": "setting",
    "reflection": "setting",
    "water": "setting",
    "shadow": "lighting",
    "golden_hour": "lighting",
}


def _tag_key(fragment: str) -> str:
    return fragment.strip().lower().replace(" ", "_")


def _blocked_tag(key: str) -> bool:
    if not key or key in _META_TAGS or key in _BLOCKED_TAGS:
        return True
    return any(part in _BLOCKED_PARTS for part in key.split("_"))


def promote_unclassified(tags: list[str]) -> dict[str, list[str]]:
    """File unclassified tags into facet groups.

    Tags that fill a known gap in the hint list join that category. Other
    ordinary tags are collected under ``detail``. Rating, sexual, and
    minor-related tags are left out.
    """
    grouped: dict[str, list[str]] = {}
    for fragment in tags:
        key = _tag_key(fragment)
        if _blocked_tag(key):
            continue
        group = _EXTRA_CATEGORY.get(key, "detail")
        term = key.replace("_", " ")
        bucket = grouped.setdefault(group, [])
        if term not in bucket:
            bucket.append(term)
    return grouped


def _subjects_facet(subjects: dict[str, Any] | None) -> list[str]:
    count = (subjects or {}).get("count")
    if count is None:
        return []
    if count == 0:
        return ["no people"]
    return ["one person"] if count == 1 else ["group"]


def explain(caption: dict[str, Any]) -> dict[str, Any]:
    """Return ``{"explain", "compare", "facets"}`` for one recorded caption."""
    raw_tags = caption.get("raw_tags") or ""
    raw_prose = caption.get("raw_prose") or ""
    profile = target_profile(caption.get("profile"))
    backend = caption.get("backend_name") or ""

    result = _compose(raw_tags, raw_prose, profile, backend)
    buckets = result.metadata.get("buckets", {})
    subjects = result.metadata.get("subjects")

    facets: dict[str, list[str]] = {}
    for category in CATEGORIES:
        terms = list(dict.fromkeys(t.strip().lower() for t in buckets.get("tags", {}).get(category, []) if t.strip()))
        if terms:
            facets[category] = terms
    if people := _subjects_facet(subjects):
        facets["people"] = people
    for group, terms in promote_unclassified(buckets.get("tags", {}).get("unclassified", [])).items():
        merged = list(dict.fromkeys([*(facets.get(group) or []), *terms]))
        if merged:
            facets[group] = merged

    compare: dict[str, Any] = {}
    if raw_tags and raw_prose:
        for mode, tags, prose in (("tags", raw_tags, ""), ("prose", "", raw_prose), ("hybrid", raw_tags, raw_prose)):
            composed = result if mode == "hybrid" else _compose(tags, prose, profile, backend)
            compare[mode] = {"final_caption": composed.final_caption, "caption_variants": composed.caption_variants}

    return {
        "explain": {
            "buckets": buckets,
            "compaction_notes": result.compaction_notes,
            "subjects": subjects,
            "drift": result.final_caption != caption.get("final_caption"),
        },
        "compare": compare,
        "facets": facets,
    }
