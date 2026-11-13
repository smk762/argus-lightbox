# CLAUDE.md — argus-lightbox

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); this file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo for argus-lens**: a static photo gallery navigated by lens's structured captions. Two halves that meet at one file:

- `bake/` (Python, `lightbox_bake`): reads the recorded pipeline run (cortex lineage store + blob store) or the synthetic fixture, re-runs lens's assembly on the raw output, and writes `web/public/data/` (`index.json`, `images/`, `thumbs/`, `xmp/`).
- `web/` (Next.js 16 static export, React 19, Tailwind v4): loads `index.json` and does all filtering and rendering client-side. **No server, no API routes.**

This is not part of argus-studio (the suite UI) and is not a pip package. This repo only consumes lens and cortex output.

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Layout

- `bake/src/lightbox_bake/`: `sources.py` (`SourceRecord`, `tape_records()` with a direct SQL join over the documented lineage schema, blob fetch by sha256 with a local-uri fallback), `folder.py` (walk a mounted photo directory, `POST /caption` on a lens server, sha256 caption cache; nothing is written back into the folder), `fixture.py` (12 drawn scenes, captioned by lens's real `compose_caption_result`), `explain.py` (recompose → buckets/compaction notes/subjects, tags/prose/hybrid compare, facets), `exif.py`, `images.py` (WebP renditions), `index.py` (`build_index`, the contract), `serve.py` (static export + baked `/data`), `cli.py` (`lightbox-bake fixture|tape|folder`).
- `Dockerfile`, `compose.yaml`, `compose.gpu.yaml`: `docker compose up --build` serves the gallery and the published lens image. The photo folder defaults to `~/Pictures` (`%USERPROFILE%\Pictures` on Windows); `PHOTOS_DIR` overrides it (local path, NAS mount, or USB). The folder index `source` is `"folder"`. Changing `PHOTOS_DIR` needs a container recreate; a finished bake drops caption-cache files whose sha256 is not in the new folder, and `make purge` wipes `/var/lib/lightbox` (`data/` and `cache/`) without touching `lens-models` or the photo mount. The lens image is pinned to `0.10.0` (`LENS_TAG` overrides). Lens defaults to hybrid: RAM++ tags plus Florence prose, or `hybrid:ram+openai-compat` when `OLLAMA_URL`+`OLLAMA_MODEL` or `COMFYUI_URL`+`COMFYUI_MODEL` is set. With `OLLAMA_URL` set, lens rewrites finished captions with `qwen3:8b` (`OLLAMA_REFINE_MODEL` overrides the model, `ARGUS_REFINE=off` skips it). With no Ollama URL, refinement stays off. A checked rewrite is stored as `caption.refine` and is not `explain.drift`. RAM++ weights live at `RAM_MODEL_DIR` on the model volume; `RAM_VOCAB_PACKS` is optional. `ARGUS_BACKEND=hybrid` or `hybrid:wd14+openai-compat` opts into WD14 tags. `CAPTION_CACHE_KEY` keeps a prose or WD14 caption out of the RAM++ cache.
- `web/src/lib/`: pure, unit-tested logic. `types.ts` (the index contract), `filter.ts` (facets/search), `urlState.ts`, `explain.ts` (per-variant trace), `highlight.ts`, `data.ts` (`NEXT_PUBLIC_DATA_URL`, the version gate), `categories.ts` (labels and token colours), `gesture.ts` (swipe → step).
- `web/src/components/`: `Lightbox.tsx` (root: load, URL state, layout), `FacetSidebar`, `PhotoGrid`, `PhotoDetail` (native `<dialog>`) + `detail/{Caption,Explain,Compare,Metadata}Tab`, `SuiteLinks`, `DemoBanner` (opt-in via `NEXT_PUBLIC_DEMO_BANNER`), `ui.tsx`.
- `web/scripts/csp.mjs`: post-build CSP (runs as part of `npm run build`).
- `web/public/data/`: the **committed fixture bake**. Web tests read it, so it doubles as a contract test between bake and web.
- `web/public/data-tape/`: the committed **tape bake** (29 PD/CC0 Commons photos) that the hosted demo serves. `make pages` builds it with `NEXT_PUBLIC_DATA_URL=/data-tape`, the `DemoBanner` and OG metadata; `.github/workflows/pages.yml` deploys `web/out/` to Cloudflare Pages. Re-bake it with `make tape` after a bake change or lens bump.

## Commands

```bash
make install   # bake venv ([dev,tape]) + npm ci
make dev       # next dev :3000
make test      # pytest (bake) + vitest (web)
make lint      # ruff + eslint + tsc
make check     # lint + test + build (what CI runs)
make fixture   # re-bake web/public/data
make up        # docker compose up --build (Pictures folder, or $PHOTOS_DIR)
make purge     # wipe /var/lib/lightbox data and caption cache, then start again
```

There's no host Node here; the Makefile falls back to `node:22-bookworm-slim` via Docker. Single tests: `cd bake && .venv/bin/pytest tests/test_bake.py::test_name -q`, `cd web && npx vitest run -t "name"`.

## Conventions & gotchas

- **`index.json` is the contract.** Its shape is documented at the top of `bake/.../index.py` and mirrored in `web/src/lib/types.ts`; change both together. It carries `version` (currently `1.0`): an additive change is a minor bump, and a breaking one is a major that `checkIndex()` refuses. After changing the bake, run `make fixture` and commit the result, or the web tests drift from reality.
- **`caption` keeps argus-lens's `CaptionResult` field names** (`final_caption`, `caption_variants`, `raw_tags`, `raw_prose`, `backend_name`, `selected_category`) so a live lens `/caption` response drops into the same shape. Don't rename them.
- **The recorded caption is the truth; recomposition is only explanation.** Never overwrite `caption` with recomposed output. Disagreement sets `explain.drift`.
- **Don't use `CaptionResult.removed_phrases` for the explain view.** It lists anything removed from *any* variant, so it over-reports for a single one. `web/src/lib/explain.ts` traces per variant from the buckets instead.
- **Unclassified tags.** Ordinary tags that miss the hint list are still facets: a known gap is filed under its category, and the rest under `detail` (`EXTRA_GROUPS`). Rating, sexual, and minor-related tags are not added. The lists are `facet_lists.example.json`. `FACET_LISTS_JSON` replaces that file; a missing path keeps the example.
- **Privacy: GPS is never emitted** (`exif.py`), and renditions are re-encoded so no source metadata survives. Keep both, since the output is published as-is.
- **The tape reader talks SQL to the lineage schema directly** (like lens's replay backend) and imports cortex only for the blob store, behind the `[tape]` extra. Don't import argus-lens's server internals.
- **Out of scope by design:** face grouping and content rating. That demo is argus-cull, built elsewhere. This UI only links to it (`SuiteLinks.tsx`). Training-dataset concerns stay in curator/forge.
- The fixture must stay obviously synthetic: placeholder art, `provenance.source = "synthetic fixture"`, and the "Synthetic fixture" badge.
- Web style: design tokens ported from the private ui-demo repo into `globals.css` `@theme` (dark-only by design). Use the token classes (`bg-base-800`, `text-text-secondary`, `text-caption`, …) rather than raw hex. `react-hooks/refs` lint is on, so don't read refs during render.
- **Modern Web Guidance.** Use Chrome's [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) skill: search it before writing UI, CSS animation or browser-API code in `web/`, and re-run `npx -y modern-web-guidance@latest legacy-scan web/src` after big changes. House exceptions: the global reduced-motion rule in `globals.css` zeroes every transition/animation duration, where the guides use a short fade. The dialog exit uses the guides' `data-closing` fallback in every browser, because React unmounts the dialog on `close` and the native discrete-`display` exit never gets to run.
- **CSP is generated at build time** by `web/scripts/csp.mjs`: hashes of Next's inline scripts, plus Trusted Types with a single `default` policy (inline, first in `<head>`) that only accepts same-origin `/_next/static/**.js` script URLs, because Turbopack's chunk loader assigns plain strings to `script.src`. It has no `createHTML`/`createScript`, so HTML and script sinks stay blocked. Don't add inline scripts, `dangerouslySetInnerHTML`, inline `<style>` or third-party origins without updating the policy, and check a built page in a browser for `securitypolicyviolation` events. `next dev` runs without it.
- Opening a photo from the grid morphs the thumbnail into the detail image with a View Transition (`Lightbox.openFromGrid`, shared name `photo-hero`). `PhotoDetail` calls `showModal()` in a layout effect so the dialog is already showing inside the `flushSync`. Keep it that way.
- Python: ruff 0.15.16, line-length 120, py311. Web: eslint-config-next 16.2.4, vitest 4.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never open a PR against `main` or push work to it directly: `main` must never be ahead of `dev`. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected and needs a PR, merge the release PR, then immediately merge `main` back into `dev` so the merge commit is not left on `main` alone.
