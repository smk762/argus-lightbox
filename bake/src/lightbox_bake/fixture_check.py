"""Whether the committed fixture bake still matches what the current bake writes.

``lightbox-bake fixture --check`` bakes into a temporary directory and compares it with ``--out``. Two things
are left out because they change on every run: ``generated_at``, and the ``training``/``training_prose``
variants, which lens assembles with random tag dropout and an unseeded shuffle. Everything else, renditions
and sidecars included, must match byte for byte.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from lightbox_bake.fixture import fixture_records
from lightbox_bake.index import build_index

RANDOM_KEYS = frozenset({"training", "training_prose"})
_SKIP = frozenset({"status.json"})


def _stable(value: object) -> object:
    """*value* without the keys that differ between two runs of the same bake."""
    if isinstance(value, dict):
        return {k: _stable(v) for k, v in value.items() if k not in RANDOM_KEYS and k != "generated_at"}
    if isinstance(value, list):
        return [_stable(v) for v in value]
    return value


def _files(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        return {}
    return {p.relative_to(root).as_posix(): p for p in root.rglob("*") if p.is_file() and p.name not in _SKIP}


def compare(expected: Path, actual: Path) -> list[str]:
    """What differs between two bake directories, ignoring run-to-run noise. Empty when they match."""
    problems: list[str] = []
    want, have = _files(expected), _files(actual)
    problems += [f"missing from {actual}: {name}" for name in sorted(want.keys() - have.keys())]
    problems += [f"not written by the bake: {name}" for name in sorted(have.keys() - want.keys())]
    for name in sorted(want.keys() & have.keys()):
        if name == "index.json":
            a = _stable(json.loads(want[name].read_text(encoding="utf-8")))
            b = _stable(json.loads(have[name].read_text(encoding="utf-8")))
            if a != b:
                problems.append("index.json differs (ignoring generated_at and the random training variants)")
        elif want[name].read_bytes() != have[name].read_bytes():
            problems.append(f"{name} differs")
    return problems


def check_fixture(committed: Path) -> list[str]:
    """Bake the fixture afresh and compare it with *committed*."""
    with tempfile.TemporaryDirectory(prefix="lightbox-fixture-") as tmp:
        fresh = Path(tmp)
        build_index(fixture_records(), fresh, source="fixture")
        return compare(fresh, committed)
