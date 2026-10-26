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
  go to a ``detail`` group. Those lists live in ``facet_lists.example.json``.
  ``FACET_LISTS_JSON`` replaces them; a missing file keeps the example.

The *recorded* caption stays the source of truth for what is displayed; if the
pinned lens version would now assemble a different ``final_caption``, the photo
is flagged with ``explain.drift`` rather than silently re-captioned.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
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


# Shipped with the package. Applied when FACET_LISTS_JSON is unset or the file is missing.
_EXAMPLE_LISTS = Path(__file__).with_name("facet_lists.example.json")
_LIST_FIELDS = ("meta_tags", "blocked_tags", "blocked_parts")


@dataclass(frozen=True)
class FacetLists:
    """Which unclassified tags become filters, and which are left out."""

    meta_tags: frozenset[str]
    blocked_tags: frozenset[str]
    blocked_parts: frozenset[str]
    extra_category: dict[str, str]


def _tag_key(fragment: str) -> str:
    return fragment.strip().lower().replace(" ", "_")


def _tag_list(value: object, field: str, source: Path) -> frozenset[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise SystemExit(f"{source}: {field} must be a list of strings")
    return frozenset(key for item in value if (key := _tag_key(item)))


def load_facet_lists(path: Path | None = None) -> FacetLists:
    """Read facet lists from *path* or ``FACET_LISTS_JSON``.

    A missing file uses ``facet_lists.example.json`` beside this module.
    """
    chosen = path
    if chosen is None:
        env = os.environ.get("FACET_LISTS_JSON", "").strip()
        chosen = Path(env) if env else None
    if chosen is None or not chosen.is_file():
        chosen = _EXAMPLE_LISTS
    try:
        payload = json.loads(chosen.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"could not read facet lists {chosen}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"{chosen}: facet lists must be a JSON object")
    missing = [field for field in (*_LIST_FIELDS, "extra_category") if field not in payload]
    if missing:
        raise SystemExit(f"{chosen}: missing {', '.join(missing)}")
    extra = payload["extra_category"]
    if not isinstance(extra, dict):
        raise SystemExit(f"{chosen}: extra_category must be an object")
    allowed = {*CATEGORIES, "detail"}
    mapped: dict[str, str] = {}
    for raw_key, group in extra.items():
        if not isinstance(raw_key, str) or not isinstance(group, str):
            raise SystemExit(f"{chosen}: extra_category entries must be strings")
        key = _tag_key(raw_key)
        if not key:
            continue
        if group not in allowed:
            raise SystemExit(f"{chosen}: {raw_key} maps to unknown category {group!r}")
        mapped[key] = group
    return FacetLists(
        meta_tags=_tag_list(payload["meta_tags"], "meta_tags", chosen),
        blocked_tags=_tag_list(payload["blocked_tags"], "blocked_tags", chosen),
        blocked_parts=_tag_list(payload["blocked_parts"], "blocked_parts", chosen),
        extra_category=mapped,
    )


def _blocked_tag(key: str, lists: FacetLists) -> bool:
    if not key or key in lists.meta_tags or key in lists.blocked_tags:
        return True
    return any(part in lists.blocked_parts for part in key.split("_"))


def promote_unclassified(tags: list[str], lists: FacetLists | None = None) -> dict[str, list[str]]:
    """File unclassified tags into facet groups.

    Tags that fill a known gap in the hint list join that category. Other
    ordinary tags are collected under ``detail``. Rating, sexual, and
    minor-related tags are left out. *lists* defaults to the example file,
    or to ``FACET_LISTS_JSON`` when that file exists.
    """
    chosen = lists if lists is not None else load_facet_lists()
    grouped: dict[str, list[str]] = {}
    for fragment in tags:
        key = _tag_key(fragment)
        if _blocked_tag(key, chosen):
            continue
        group = chosen.extra_category.get(key, "detail")
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
