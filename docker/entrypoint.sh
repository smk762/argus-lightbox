#!/bin/sh
# Listen on :3000 immediately, caption PHOTOS_DIR, and keep serving.
# The gallery replaces the status page once index.json is written.
set -eu

if [ ! -d "${PHOTOS_DIR:-}" ]; then
  echo "photo folder ${PHOTOS_DIR:-<unset>} is not mounted." >&2
  echo "docker compose uses ~/Pictures (or %USERPROFILE%\\Pictures) unless PHOTOS_DIR is set." >&2
  exit 1
fi

echo "photos: ${PHOTOS_DIR}"
echo "lens:   ${LENS_URL}"
mkdir -p /var/lib/lightbox/data
rm -f /var/lib/lightbox/data/error.txt

python -m lightbox_bake.serve \
  --html /usr/share/lightbox/html \
  --data /var/lib/lightbox/data \
  --cache /var/lib/lightbox/cache \
  --host 0.0.0.0 \
  --port 3000 &
server_pid=$!

shutdown() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap shutdown TERM INT

set -- lightbox-bake folder \
  --photos "$PHOTOS_DIR" \
  --out /var/lib/lightbox/data \
  --lens-url "$LENS_URL" \
  --cache /var/lib/lightbox/cache
if [ -n "${PHOTOS_LIMIT:-}" ]; then
  set -- "$@" --limit "$PHOTOS_LIMIT"
fi
if [ "${RECAPTION:-}" = "1" ]; then
  set -- "$@" --recaption
fi

if ! "$@"; then
  echo "Captioning failed. The log above has the reason." > /var/lib/lightbox/data/error.txt
fi

wait "$server_pid"
