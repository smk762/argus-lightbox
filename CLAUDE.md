# CLAUDE.md — argus-lightbox

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); this file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo for argus-lens**: a static photo gallery navigated by lens's structured captions. Two halves that meet at one file:

- `bake/` (Python, `lightbox_bake`): reads the recorded pipeline run (cortex lineage store + blob store) or the synthetic fixture, re-runs lens's assembly on the raw output, and writes `web/public/data/` (`index.json`, `images/`, `thumbs/`, `xmp/`).
- `web/` (Next.js 16 static export, React 19, Tailwind v4): loads `index.json` and does all filtering and rendering client-side. **No server, no API routes.**

This is not part of argus-studio (the suite UI) and is not a pip package. The suite runs quarry → curator → lens → forge → proof; this repo only consumes lens and cortex output.

## Layout

- `bake/src/lightbox_bake/`: `sources.py` (`SourceRecord`, `tape_records()` with a direct SQL join over the documented lineage schema, blob fetch by sha256 with a local-uri fallback), `fixture.py` (12 drawn scenes, captioned by lens's real `compose_caption_result`), `explain.py` (recompose → buckets/compaction notes/subjects, tags/prose/hybrid compare, facets), `exif.py`, `images.py` (WebP renditions), `index.py` (`build_index`, the contract), `cli.py` (`lightbox-bake fixture|tape`).
- `web/src/lib/`: pure, unit-tested logic. `types.ts` (the index contract), `filter.ts` (facets/search), `urlState.ts`, `explain.ts` (per-variant trace), `highlight.ts`, `data.ts` (`NEXT_PUBLIC_DATA_URL`, the version gate), `categories.ts` (labels and token colours), `gesture.ts` (swipe → step).
- `web/src/components/`: `Lightbox.tsx` (root: load, URL state, layout), `FacetSidebar`, `PhotoGrid`, `PhotoDetail` (native `<dialog>`) + `detail/{Caption,Explain,Compare,Metadata}Tab`, `SuiteLinks`, `ui.tsx`.
- `web/scripts/csp.mjs`: post-build CSP (runs as part of `npm run build`).
- `web/public/data/`: the **committed fixture bake**. Web tests read it, so it doubles as a contract test between bake and web.

## Commands

```bash
make install   # bake venv ([dev,tape]) + npm ci
make dev       # next dev :3000
make test      # pytest (bake) + vitest (web)
make lint      # ruff + eslint + tsc
make check     # lint + test + build (what CI runs)
make fixture   # re-bake web/public/data
```

There's no host Node here; the Makefile falls back to `node:22-bookworm-slim` via Docker. Single tests: `cd bake && .venv/bin/pytest tests/test_bake.py::test_name -q`, `cd web && npx vitest run -t "name"`.

## Conventions & gotchas

- **`index.json` is the contract.** Its shape is documented at the top of `bake/.../index.py` and mirrored in `web/src/lib/types.ts`; change both together. It carries `version` (currently `1.0`): an additive change is a minor bump, and a breaking one is a major that `checkIndex()` refuses. After changing the bake, run `make fixture` and commit the result, or the web tests drift from reality.
- **`caption` keeps argus-lens's `CaptionResult` field names** (`final_caption`, `caption_variants`, `raw_tags`, `raw_prose`, `backend_name`, `selected_category`) so a live lens `/caption` response drops into the same shape. Don't rename them.
- **The recorded caption is the truth; recomposition is only explanation.** Never overwrite `caption` with recomposed output. Disagreement sets `explain.drift`.
- **Don't use `CaptionResult.removed_phrases` for the explain view.** It lists anything removed from *any* variant, so it over-reports for a single one. `web/src/lib/explain.ts` traces per variant from the buckets instead.
- **Privacy: GPS is never emitted** (`exif.py`), and renditions are re-encoded so no source metadata survives. Keep both, since the output is published as-is.
- **The tape reader talks SQL to the lineage schema directly** (like lens's replay backend) and imports cortex only for the blob store, behind the `[tape]` extra. Don't import argus-lens's server internals.
- **Out of scope by design:** face grouping and content rating (argus-curator), training-dataset concerns (curator/forge). The UI cross-links to them (`SuiteLinks.tsx`) and doesn't implement them.
- The fixture must stay obviously synthetic: placeholder art, `provenance.source = "synthetic fixture"`, and the "Synthetic fixture" badge.
- Web style: design tokens ported from the private ui-demo repo into `globals.css` `@theme` (dark-only by design). Use the token classes (`bg-base-800`, `text-text-secondary`, `text-caption`, …) rather than raw hex. `react-hooks/refs` lint is on, so don't read refs during render.
- **Modern Web Guidance.** Use Chrome's [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) skill: search it before writing UI, CSS animation or browser-API code in `web/`, and re-run `npx -y modern-web-guidance@latest legacy-scan web/src` after big changes. House exceptions: the global reduced-motion rule in `globals.css` zeroes every transition/animation duration, where the guides use a short fade. The dialog exit uses the guides' `data-closing` fallback in every browser, because React unmounts the dialog on `close` and the native discrete-`display` exit never gets to run.
- **CSP is generated at build time** by `web/scripts/csp.mjs`: hashes of Next's inline scripts, plus Trusted Types with no policies allowed. Don't add inline scripts, `dangerouslySetInnerHTML`, inline `<style>` or third-party origins without updating the policy, and check a built page in a browser for `securitypolicyviolation` events. `next dev` runs without it.
- Opening a photo from the grid morphs the thumbnail into the detail image with a View Transition (`Lightbox.openFromGrid`, shared name `photo-hero`). `PhotoDetail` calls `showModal()` in a layout effect so the dialog is already showing inside the `flushSync`. Keep it that way.
- Python: ruff 0.15.16, line-length 120, py311. Web: eslint-config-next 16.2.4, vitest 4.
