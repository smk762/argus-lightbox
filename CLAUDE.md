# CLAUDE.md — argus-lightbox

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); this file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo for argus-lens**: a static photo gallery navigated by lens's structured captions. Two halves that meet at one file:

- `bake/` (Python, `lightbox_bake`): reads the recorded pipeline run (cortex lineage store + blob store) or the synthetic fixture, re-runs lens's assembly on the raw output, and writes `web/public/data/` (`index.json`, `images/`, `thumbs/`, `xmp/`).
- `web/` (Next.js 16 static export, React 19, Tailwind v4): loads `index.json` and does all filtering and rendering client-side. **No Next server or API routes.** The one write path is `POST /api/caption-choice`, served only by `bake/.../serve.py` in folder mode. On a static host it fails, and the UI shows the error. CLI and server flags are in `docs/cli.md`.

This is not part of argus-studio (the suite UI) and is not a pip package. This repo only consumes lens and cortex output.

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Layout

- `bake/src/lightbox_bake/`: `sources.py` (`SourceRecord`, `tape_records()` with a direct SQL join over the documented lineage schema, blob fetch by sha256 with a local-uri fallback), `folder.py` (walk a mounted photo directory, `POST /caption` on a lens server, sha256 caption cache; nothing is written back into the folder), `fixture.py` (12 drawn scenes, captioned by lens's real `compose_caption_result`), `explain.py` (recompose → buckets/compaction notes/subjects, tags/prose/hybrid compare, facets), `exif.py`, `images.py` (WebP renditions: the detail image, the 480 px grid thumbnail, and 240/360 px widths for `srcset`), `index.py` (`build_index`, the contract), `serve.py` (static export + baked `/data`), `cli.py` (`lightbox-bake fixture|tape|folder|thumbs`; `thumbs` adds thumbnail widths to an existing bake without re-captioning).
- `Dockerfile`, `compose.yaml`, `compose.gpu.yaml`: `docker compose up --build` serves the gallery and the published lens image. The photo folder defaults to `~/Pictures` (`%USERPROFILE%\Pictures` on Windows); `PHOTOS_DIR` overrides it (local path, NAS mount, or USB). The folder index `source` is `"folder"`. Changing `PHOTOS_DIR` needs a container recreate; a finished bake drops caption-cache files whose sha256 is not in the new folder, and `make purge` wipes `/var/lib/lightbox` (`data/` and `cache/`) without touching `lens-models` or the photo mount. The lens image is pinned to `0.10.0` (`LENS_TAG` overrides). Lens defaults to hybrid: RAM++ tags plus Florence prose, or `hybrid:ram+openai-compat` when `OLLAMA_URL`+`OLLAMA_MODEL` or `COMFYUI_URL`+`COMFYUI_MODEL` is set. With `OLLAMA_URL` set, lens rewrites finished captions with `qwen3:8b` (`OLLAMA_REFINE_MODEL` overrides the model, `ARGUS_REFINE=off` skips it). With no Ollama URL, refinement stays off. A checked rewrite is stored as `caption.refine` and is not `explain.drift`. RAM++ weights live at `RAM_MODEL_DIR` on the model volume; `RAM_VOCAB_PACKS` is optional. `ARGUS_BACKEND=hybrid` or `hybrid:wd14+openai-compat` opts into WD14 tags. `CAPTION_CACHE_KEY` keeps a prose or WD14 caption out of the RAM++ cache.
- `web/src/lib/`: pure, unit-tested logic. `types.ts` (the index contract), `filter.ts` (facets/search), `urlState.ts`, `explain.ts` (per-variant trace), `highlight.ts`, `data.ts` (`NEXT_PUBLIC_DATA_URL`, the version gate), `categories.ts` (labels and token colours), `gesture.ts` (swipe → step), `facetGroups.ts` (sidebar groups: default open/closed, remembered per group in localStorage), `caption.ts` (which variant the grid and detail show first: `NEXT_PUBLIC_DEFAULT_CAPTION`, default `zeroshot`, falling back to `final_caption`), `lensDocs.ts` (lens doc links at the baked version, and the "Captioned by" line built only from recorded fields), `prerender.ts` (build-time only: the first grid page, photo count and facet counts baked into the HTML), `thumbs.ts` (which thumbnails load eagerly or with `fetchpriority=high`, and the `srcset`/`sizes` that match the column layout), `links.ts` (live demo URLs, and the rule that `*.dragonhound.dev` links open in the same tab).
- `web/src/components/`: `Lightbox.tsx` (root: load, URL state, layout), `FacetSidebar`, `PhotoGrid`, `PhotoDetail` (native `<dialog>`) + `detail/{Caption,Explain,Compare,Metadata}Tab`, `SuiteLinks`, `DemoStrip` (the Dragonhound family bar, opt-in via `NEXT_PUBLIC_DEMO_BANNER`; rendered from `vendor/dh/dh-strip.mjs`, checked against its `stripHtml()` by `src/lib/shared.test.ts`), `LensDocs` (the `/docs` page, `app/docs/page.tsx`) + `LensDocLink`, `ui.tsx`. Until lens's docs are imported (follow-up to #16), help links go to lens's README on GitHub. Change `lensDocs.ts` when the import lands.
- `web/scripts/csp.mjs`: post-build CSP (runs as part of `npm run build`).
- `web/scripts/split-index.mjs`: post-build, only with `LIGHTBOX_PRERENDER=1`. Writes `list.json` (the index without each photo's `explain`/`compare`, about 45% of the bytes) and `detail/<id>.json` next to the exported `index.json`, which stays as the bake wrote it.
- `web/public/data/`: the **committed fixture bake**. Web tests read it, so it doubles as a contract test between bake and web.
- `web/public/data-tape/`: the committed **tape bake** (205 CC0/PD photos, mostly Flickr via quarry's Megalith archive; about 30 MB) that the hosted demo serves. `make pages` builds it with `NEXT_PUBLIC_DATA_URL=/data-tape`, the demo strip and OG metadata; `.github/workflows/pages.yml` deploys `web/out/` to Cloudflare Pages. Re-bake it with `make tape` after a bake change or lens bump.

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

- **`index.json` is the contract.** Its shape is documented at the top of `bake/.../index.py` and mirrored in `web/src/lib/types.ts`; change both together. It carries `version` (currently `1.2`): an additive change is a minor bump, and a breaking one is a major that `checkIndex()` refuses. After changing the bake, run `make fixture` and commit the result, or the web tests drift from reality.
- **`caption` keeps argus-lens's `CaptionResult` field names** (`final_caption`, `caption_variants`, `raw_tags`, `raw_prose`, `backend_name`, `selected_category`) so a live lens `/caption` response drops into the same shape. Don't rename them.
- **The recorded caption is the truth; recomposition is only explanation.** Never overwrite `caption` with recomposed output. Disagreement sets `explain.drift`.
- **Don't use `CaptionResult.removed_phrases` for the explain view.** It lists anything removed from *any* variant, so it over-reports for a single one. `web/src/lib/explain.ts` traces per variant from the buckets instead.
- **Unclassified tags.** Ordinary tags that miss the hint list are still facets: a known gap is filed under its category, and the rest under `detail` (`EXTRA_GROUPS`). Rating, sexual, and minor-related tags are not added. The lists are `facet_lists.example.json`. `FACET_LISTS_JSON` replaces that file; a missing path keeps the example.
- **Privacy: GPS is never emitted** (`exif.py`), and renditions are re-encoded so no source metadata survives. Keep both, since the output is published as-is.
- **The tape reader talks SQL to the lineage schema directly** (like lens's replay backend) and imports cortex only for the blob store, behind the `[tape]` extra. Don't import argus-lens's server internals.
- **Out of scope by design:** face grouping and content rating. That demo is argus-cull, built elsewhere. This UI only links to it (`SuiteLinks.tsx`). Training-dataset concerns stay in curator/forge.
- The fixture must stay obviously synthetic: placeholder art, `provenance.source = "synthetic fixture"`, and the "Sample data" badge (the shared demo-state vocabulary; its title says "Synthetic fixture").
- Web style: the Dragonhound shared layer, vendored in `web/vendor/dh/` (tokens, strip, badge; re-sync from dragonhound-site with `node scripts/sync-shared.mjs <this repo> --dest web/vendor/dh`, never edit the copies; CI's `dh-shared` job checks them). `globals.css` maps the `@theme inline` classes (`bg-base-800`, `text-text-secondary`, `text-link`, …) onto the `--dh-*` dark tokens, and overrides only `--dh-accent`/`--dh-on-accent` (Lightbox indigo). Dark-only by design: `<html data-theme="dark" data-dh-theme-lock>`, so `dh-theme.js` and its cookie aren't used. The facet hues are the shared categorical palette (`--dh-cat-1..8` with `-ink`/`-tint`): one fixed slot per group in `categories.ts`, mirrored as `[data-group]` custom properties in `globals.css` (`--group`, `--group-ink`, `--group-tint`; `prerender.test.ts` keeps them in step). Text on a tint uses the ink; nothing below `text-caption` (`--dh-text-2xs`, 12 px); warnings use `text-warn-ink`/`bg-warn-tint`. Use the token classes rather than raw hex; demo-state badges use `dh-badge` and the four shared labels. Favicons are the argus-lens package mark (argus-cortex `brand/packages/lens/`, dark variant). `react-hooks/refs` lint is on, so don't read refs during render.
- **Modern Web Guidance.** Use Chrome's [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) skill: search it before writing UI, CSS animation or browser-API code in `web/`, and re-run `npx -y modern-web-guidance@latest legacy-scan web/src` after big changes. House exceptions: the global reduced-motion rule in `globals.css` zeroes every transition/animation duration, where the guides use a short fade. The dialog exit uses the guides' `data-closing` fallback in every browser, because React unmounts the dialog on `close` and the native discrete-`display` exit never gets to run.
- **Prerendered static export.** `make pages` sets `LIGHTBOX_PRERENDER=1`: the home page bakes its first 48 thumbnails (with `width`/`height`), the count and the facet counts into the HTML, and /docs bakes the lens version, so nothing shifts when data loads. The client then fetches `list.json` for search, facets and paging, and `detail/<id>.json` when a photo opens (or its thumbnail is hovered). Without the switch (`make build`, the Docker image), both pages read `index.json` at runtime, because a folder gallery rewrites it while it captions. The CSP forbids inline `style` attributes, so anything in the prerendered HTML is styled by class (facet colours use `data-group` and `--group` in `globals.css`, kept in step with `categories.ts` by a test); per-photo colours are set through the CSSOM after hydration.
- **CSP is generated at build time** by `web/scripts/csp.mjs`: hashes of Next's inline scripts, plus Trusted Types with a single `default` policy (inline, first in `<head>`) that only accepts same-origin `/_next/static/**.js` script URLs, because Turbopack's chunk loader assigns plain strings to `script.src`. It has no `createHTML`/`createScript`, so HTML and script sinks stay blocked. Don't add inline scripts, `dangerouslySetInnerHTML`, inline `<style>` or third-party origins without updating the policy, and check a built page in a browser for `securitypolicyviolation` events. `next dev` runs without it.
- Opening a photo from the grid morphs the thumbnail into the detail image with a View Transition (`Lightbox.openFromGrid`, shared name `photo-hero`). `PhotoDetail` calls `showModal()` in a layout effect so the dialog is already showing inside the `flushSync`. Keep it that way.
- Python: ruff 0.15.16, line-length 120, py311. Web: eslint-config-next 16.2.4, vitest 4.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`: `main` must never be ahead of `dev`, with one exception. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected, the release is a reviewed PR from `dev` into `main`, and merging it leaves a merge commit on `main` alone. That merge commit is the one exception to the rule: it leaves `main` one commit ahead of `dev` with an identical tree. Leave it there and don't merge `main` back into `dev`. Anything else on `main` that `dev` lacks is a mistake (`git diff origin/dev origin/main` must be empty). Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.
