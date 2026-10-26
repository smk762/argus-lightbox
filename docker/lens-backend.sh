#!/bin/sh
# Pick the caption backend, then start lens.
#
# Default is hybrid: RAM++ photo tags plus a written caption. The tags are what
# the gallery filters, and what the Compare tab assembles three ways.
# With nothing else set, Florence writes the sentence (hybrid:ram+florence2).
# OLLAMA_URL and OLLAMA_MODEL, or COMFYUI_URL and COMFYUI_MODEL, replace Florence
# (hybrid:ram+openai-compat). RAM++ runs in the lens container, on GPU when one
# is passed through and on CPU otherwise.
# OLLAMA_REFINE_MODEL rewrites finished captions and does not replace Florence
# when no vision model was named.
# WD14 stays available for a booru or anime checkpoint:
#   ARGUS_BACKEND=hybrid                         WD14 tags + Florence
#   ARGUS_BACKEND=hybrid:wd14+openai-compat      WD14 tags + the vision server above
#   ARGUS_BACKEND=florence2                      prose only, no tags
#   ARGUS_BACKEND=openai-compat                  the vision server only, no tags
set -eu

v1() {
  url=${1%/}
  case "$url" in
    */v1) printf '%s\n' "$url" ;;
    *) printf '%s/v1\n' "$url" ;;
  esac
}

# ComfyUI supplies prose only when its model is named. A bare URL must not
# hide an Ollama vision model that is ready to use.
if [ -z "${ARGUS_OPENAI_COMPAT_BASE_URL:-}" ]; then
  if [ -n "${COMFYUI_URL:-}" ] && [ -n "${COMFYUI_MODEL:-}" ]; then
    ARGUS_OPENAI_COMPAT_BASE_URL=$(v1 "$COMFYUI_URL")
  elif [ -n "${OLLAMA_URL:-}" ] && [ -n "${OLLAMA_MODEL:-}" ]; then
    ARGUS_OPENAI_COMPAT_BASE_URL=$(v1 "$OLLAMA_URL")
  fi
fi

if [ -z "${ARGUS_OPENAI_COMPAT_MODEL:-}" ]; then
  if [ -n "${COMFYUI_URL:-}" ] && [ -n "${COMFYUI_MODEL:-}" ]; then
    ARGUS_OPENAI_COMPAT_MODEL=$COMFYUI_MODEL
  elif [ -n "${OLLAMA_MODEL:-}" ] && [ -n "${OLLAMA_URL:-}${ARGUS_OPENAI_COMPAT_BASE_URL:-}" ]; then
    ARGUS_OPENAI_COMPAT_MODEL=$OLLAMA_MODEL
  fi
fi

if [ -n "${ARGUS_OPENAI_COMPAT_BASE_URL:-}" ]; then
  export ARGUS_OPENAI_COMPAT_BASE_URL
fi
if [ -n "${ARGUS_OPENAI_COMPAT_MODEL:-}" ]; then
  export ARGUS_OPENAI_COMPAT_MODEL
fi

if [ -z "${ARGUS_OPENAI_COMPAT_PROMPT:-}" ] && [ -n "${ARGUS_OPENAI_COMPAT_BASE_URL:-}" ] && [ -n "${ARGUS_OPENAI_COMPAT_MODEL:-}" ]; then
  ARGUS_OPENAI_COMPAT_PROMPT=straightforward
  export ARGUS_OPENAI_COMPAT_PROMPT
fi

if [ -z "${ARGUS_REFINE_BASE_URL:-}" ] && [ -n "${OLLAMA_URL:-}" ]; then
  ARGUS_REFINE_BASE_URL=$(v1 "$OLLAMA_URL")
  export ARGUS_REFINE_BASE_URL
fi
if [ -z "${ARGUS_REFINE_MODEL:-}" ] && [ -n "${OLLAMA_REFINE_MODEL:-}" ]; then
  ARGUS_REFINE_MODEL=$OLLAMA_REFINE_MODEL
  export ARGUS_REFINE_MODEL
fi

if [ -z "${ARGUS_BACKEND:-}" ]; then
  if [ -n "${ARGUS_OPENAI_COMPAT_BASE_URL:-}" ] && [ -n "${ARGUS_OPENAI_COMPAT_MODEL:-}" ]; then
    ARGUS_BACKEND=hybrid:ram+openai-compat
  else
    ARGUS_BACKEND=hybrid:ram+florence2
  fi
fi
export ARGUS_BACKEND

echo "lens backend: ${ARGUS_BACKEND}" >&2
case "${ARGUS_BACKEND}" in
  hybrid | *wd14*) echo "tags: wd14" >&2 ;;
  *ram*) echo "tags: ram++" >&2 ;;
esac
if [ -n "${ARGUS_OPENAI_COMPAT_MODEL:-}" ]; then
  echo "prose: ${ARGUS_OPENAI_COMPAT_MODEL} at ${ARGUS_OPENAI_COMPAT_BASE_URL}" >&2
fi
if [ -n "${ARGUS_REFINE_MODEL:-}" ]; then
  echo "refine: ${ARGUS_REFINE_MODEL} at ${ARGUS_REFINE_BASE_URL:-the server default}" >&2
fi

exec argus-lens serve --port 8100 --cors
