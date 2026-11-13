UV ?= uv
# No host Node required: npm runs in the official image when `npm` isn't on PATH.
HOST_NPM := $(shell command -v npm 2>/dev/null)
DOCKER_NPM = docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR)/web:/app -w /app $(1) node:22-bookworm-slim npm
NPM ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,))
NPM_DEV ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,-p $(PORT):$(PORT)))
PORT ?= 3000
# The hosted demo (Cloudflare Pages): the committed tape bake, the demo banner, absolute OG URLs.
SITE_URL ?= https://lightbox.dragonhound.dev
# The caption variant the grid and detail view show first (a caption_variants key, or `final`).
NEXT_PUBLIC_DEFAULT_CAPTION ?= zeroshot
PAGES_ENV = NEXT_PUBLIC_DATA_URL=/data-tape NEXT_PUBLIC_DEMO_BANNER=1 NEXT_PUBLIC_SITE_URL=$(SITE_URL) NEXT_PUBLIC_DEFAULT_CAPTION=$(NEXT_PUBLIC_DEFAULT_CAPTION)
NPM_PAGES ?= $(if $(HOST_NPM),$(PAGES_ENV) npm,$(call DOCKER_NPM,$(addprefix -e ,$(PAGES_ENV))))
BAKE := bake/.venv/bin/lightbox-bake

.PHONY: help install fixture tape dev build pages test lint check clean up purge

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install:  ## Bake venv (with the tape extra) + web dependencies
	cd bake && $(UV) venv -q && $(UV) pip install -q -e ".[dev,tape]"
	cd web && $(NPM) ci

fixture:  ## Re-bake the committed synthetic fixture into web/public/data
	$(BAKE) fixture --out web/public/data

tape:  ## Bake the recorded pipeline run (needs CORTEX_PG_URL, CORTEX_S3_*) into web/public/data-tape
	$(BAKE) tape --out web/public/data-tape

up:  ## Caption ~/Pictures (or PHOTOS_DIR) via Docker and serve the gallery
	PHOTOS_DIR="$(PHOTOS_DIR)" PORT="$(PORT)" docker compose up --build

purge:  ## Wipe the gallery and caption cache, then caption the current folder again
	docker compose stop lightbox
	docker compose run --rm --build --no-deps --entrypoint lightbox-bake lightbox purge --root /var/lib/lightbox
	docker compose up -d --no-deps lightbox

dev:  ## next dev on :$(PORT) (serves web/public/data)
	cd web && $(NPM_DEV) run dev -- --hostname 0.0.0.0 --port $(PORT)

build:  ## Static export to web/out/
	cd web && $(NPM) run build

pages:  ## Static export of the hosted demo (tape bake, banner) to web/out/, for Cloudflare Pages
	cd web && $(NPM_PAGES) run build
	rm -rf web/out/data  # the synthetic fixture; the demo reads /data-tape

test:  ## Bake pytest + web vitest
	cd bake && .venv/bin/pytest -q
	cd web && $(NPM) test

lint:  ## ruff (bake) + eslint & tsc (web)
	cd bake && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd web && $(NPM) run lint && $(NPM) run typecheck

check: lint test build  ## Everything CI runs

clean:  ## Remove build output and virtualenvs
	rm -rf bake/.venv web/node_modules web/.next web/out
