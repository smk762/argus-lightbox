"""Re-run lens's assembly on the recorded raw output — CPU only, no model.

The tape stores each caption's final text, variants, and raw model output, but
not the intermediate assembly state. ``compose_caption_result`` rebuilds that
deterministically from the raw tags/prose, which gives the demo:

* **explain** — per-category buckets (tags vs prose), compaction notes and the
  headcount estimate, for the "how this caption was built" panel;
* **compare** — the same raw output assembled tags-only, prose-only and hybrid,
  which shows the assembly (not the model) doing the work;
* **facets** — the classified tag fragments the gallery filters on.

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
