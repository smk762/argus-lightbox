"""The lens container script. RAM++ hybrid is the default; WD14 is opt-in."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "docker" / "lens-backend.sh"


def _resolve(tmp_path: Path, **extra: str) -> dict[str, str]:
    stub = tmp_path / "argus-lens"
    stub.write_text(
        "#!/bin/sh\n"
        "python3 -c 'import json,os,sys; "
        'json.dump({k: os.environ[k] for k in os.environ if k.startswith("ARGUS_")}, sys.stdout)\'\n',
        encoding="utf-8",
    )
    stub.chmod(0o755)
    env = {"PATH": f"{tmp_path}{os.pathsep}/usr/bin{os.pathsep}/bin", "HOME": str(tmp_path)}
    env.update(extra)
    proc = subprocess.run(
        ["/bin/sh", str(_SCRIPT)],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout)


def test_nothing_set_uses_ram_tags_and_florence_prose(tmp_path) -> None:
    chosen = _resolve(tmp_path)
    assert chosen["ARGUS_BACKEND"] == "hybrid:ram+florence2"
    assert "ARGUS_OPENAI_COMPAT_BASE_URL" not in chosen
    assert "ARGUS_REFINE_MODEL" not in chosen


def test_ollama_vision_model_supplies_prose_beside_ram_tags(tmp_path) -> None:
    chosen = _resolve(tmp_path, OLLAMA_URL="http://host.docker.internal:11434", OLLAMA_MODEL="qwen3-vl:8b-instruct")
    assert chosen["ARGUS_BACKEND"] == "hybrid:ram+openai-compat"
    assert chosen["ARGUS_OPENAI_COMPAT_BASE_URL"] == "http://host.docker.internal:11434/v1"
    assert chosen["ARGUS_OPENAI_COMPAT_MODEL"] == "qwen3-vl:8b-instruct"
    assert chosen["ARGUS_OPENAI_COMPAT_PROMPT"] == "straightforward"


def test_a_url_that_already_ends_in_v1_is_not_doubled(tmp_path) -> None:
    chosen = _resolve(tmp_path, OLLAMA_URL="http://host:11434/v1/", OLLAMA_MODEL="llava")
    assert chosen["ARGUS_OPENAI_COMPAT_BASE_URL"] == "http://host:11434/v1"


def test_refine_model_does_not_replace_florence(tmp_path) -> None:
    chosen = _resolve(tmp_path, OLLAMA_URL="http://host:11434", OLLAMA_REFINE_MODEL="qwen3:8b")
    assert chosen["ARGUS_BACKEND"] == "hybrid:ram+florence2"
    assert "ARGUS_OPENAI_COMPAT_MODEL" not in chosen
    assert chosen["ARGUS_REFINE_MODEL"] == "qwen3:8b"
    assert chosen["ARGUS_REFINE_BASE_URL"] == "http://host:11434/v1"


def test_comfyui_takes_prose_and_ollama_stays_the_rewriter(tmp_path) -> None:
    chosen = _resolve(
        tmp_path,
        OLLAMA_URL="http://ollama:11434",
        OLLAMA_MODEL="qwen3:8b",
        OLLAMA_REFINE_MODEL="qwen3:8b",
        COMFYUI_URL="http://comfy:8188",
        COMFYUI_MODEL="joycaption",
    )
    assert chosen["ARGUS_BACKEND"] == "hybrid:ram+openai-compat"
    assert chosen["ARGUS_OPENAI_COMPAT_BASE_URL"] == "http://comfy:8188/v1"
    assert chosen["ARGUS_OPENAI_COMPAT_MODEL"] == "joycaption"
    assert chosen["ARGUS_REFINE_BASE_URL"] == "http://ollama:11434/v1"
    assert chosen["ARGUS_REFINE_MODEL"] == "qwen3:8b"


def test_comfyui_url_without_a_model_leaves_ollama_as_prose(tmp_path) -> None:
    chosen = _resolve(
        tmp_path,
        OLLAMA_URL="http://192.168.1.198:11434",
        OLLAMA_MODEL="qwen3-vl:8b-instruct",
        COMFYUI_URL="http://192.168.1.39:8188",
    )
    assert chosen["ARGUS_BACKEND"] == "hybrid:ram+openai-compat"
    assert chosen["ARGUS_OPENAI_COMPAT_BASE_URL"] == "http://192.168.1.198:11434/v1"
    assert chosen["ARGUS_OPENAI_COMPAT_MODEL"] == "qwen3-vl:8b-instruct"


def test_an_explicit_backend_is_left_alone(tmp_path) -> None:
    chosen = _resolve(tmp_path, ARGUS_BACKEND="openai", OLLAMA_URL="http://host:11434", OLLAMA_MODEL="llava")
    assert chosen["ARGUS_BACKEND"] == "openai"
