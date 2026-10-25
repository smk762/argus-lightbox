UV ?= uv
# No host Node required: npm runs in the official image when `npm` isn't on PATH.
HOST_NPM := $(shell command -v npm 2>/dev/null)
DOCKER_NPM = docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR)/web:/app -w /app $(1) node:22-bookworm-slim npm
NPM ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,))
NPM_DEV ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,-p $(PORT):$(PORT)))
PORT ?= 3000
BAKE := bake/.venv/bin/lightbox-bake

.PHONY: help install fixture tape dev build test lint check clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install:  ## Bake venv (with the tape extra) + web dependencies
	cd bake && $(UV) venv -q && $(UV) pip install -q -e ".[dev,tape]"
	cd web && $(NPM) ci

fixture:  ## Re-bake the committed synthetic fixture into web/public/data
	$(BAKE) fixture --out web/public/data

tape:  ## Bake the recorded pipeline run (needs CORTEX_PG_URL, CORTEX_S3_*) into web/public/data-tape
	$(BAKE) tape --out web/public/data-tape

dev:  ## next dev on :$(PORT) (serves web/public/data)
	cd web && $(NPM_DEV) run dev -- --hostname 0.0.0.0 --port $(PORT)

build:  ## Static export to web/out/
	cd web && $(NPM) run build

test:  ## Bake pytest + web vitest
	cd bake && .venv/bin/pytest -q
	cd web && $(NPM) test

lint:  ## ruff (bake) + eslint & tsc (web)
	cd bake && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd web && $(NPM) run lint && $(NPM) run typecheck

check: lint test build  ## Everything CI runs

clean:  ## Remove build output and virtualenvs
	rm -rf bake/.venv web/node_modules web/.next web/out
