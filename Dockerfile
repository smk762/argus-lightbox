# syntax=docker/dockerfile:1
# Static gallery plus the bake step. Lens runs as its own service (see compose.yaml);
# this image only captions through that HTTP API and serves the result.

FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# The caption variant the gallery shows first; inlined into the static build.
ARG NEXT_PUBLIC_DEFAULT_CAPTION=zeroshot
ENV NEXT_PUBLIC_DEFAULT_CAPTION=$NEXT_PUBLIC_DEFAULT_CAPTION
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PHOTOS_DIR=/photos \
    LENS_URL=http://lens:8100
WORKDIR /src/bake
COPY bake/ /src/bake/
RUN pip install --no-cache-dir .
COPY --from=web /src/web/out /usr/share/lightbox/html
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
