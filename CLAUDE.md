# CLAUDE.md — argus-lightbox

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); this file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo for argus-lens**: a static photo gallery navigated by lens's structured captions. Two halves that meet at one file:

- `bake/` (Python, `lightbox_bake`): reads the recorded pipeline run (cortex lineage store + blob store), a photo folder captioned by a lens server, or the synthetic fixture. It re-runs lens's assembly on the raw output and writes `web/public/data/` (`index.json`, `images/`, `thumbs/`, `xmp/`).
- `web/` (Next.js 16 static export, React 19, Tailwind v4): loads `index.json` and does all filtering and rendering client-side. **No Next server or API routes.** The one write path is `POST /api/caption-choice`, served only by `bake/.../serve.py` in folder mode. On a static host it fails, and the UI shows the error. CLI and server flags are in `docs/cli.md`; Docker and env settings are in the README and `compose.yaml`.

This is not part of argus-studio (the suite UI) and is not a pip package. This repo only consumes lens and cortex output.

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Must never happen

Each rule names what checks it. A new rule gets a check, not just a row; one about code shape (a banned import or API) can go in argus-ci's suite-rules catalogue instead.

| Must never happen | Enforced by |
|---|---|
| GPS reaches the published output | `test_bake::test_exif_is_normalised_and_never_includes_gps` |
| A rendition carries source metadata (EXIF, XMP, ICC, IPTC) | `test_rules::test_renditions_carry_no_source_metadata` |
| The photo folder's path appears in the published index | `test_folder::test_folder_bake_caches_captions_and_hides_the_path` |
| Folder mode writes into the photo folder | Same test (snapshots the folder before and after); `:ro` mount in `compose.yaml` |
| `serve.py` serves a file outside its root | `test_folder::test_serve_uses_baked_data_and_refuses_traversal`, `test_serve_does_not_follow_a_directory_index_out_of_root` |
| Rating, sexual or minor-related tags become facets | `test_bake::test_unclassified_ordinary_tags_are_filterable_and_sexual_tags_are_not` |
| `caption` is overwritten with recomposed output (disagreement sets `explain.drift` instead) | `test_rules::test_the_recorded_caption_is_published_even_when_recomposition_disagrees` |
| `caption` renames lens's `CaptionResult` fields (`final_caption`, `caption_variants`, `raw_tags`, `raw_prose`, `backend_name`, `selected_category`) | `test_folder::test_caption_record_keeps_wire_fields_and_rejects_a_bare_error` |
| The explain view reads `CaptionResult.removed_phrases` (it over-reports for a single variant; `explain.ts` traces per variant from the buckets) | `rules.test.ts` |
| The committed fixture (`web/public/data/`) differs from what the bake writes | `lightbox-bake fixture --check` (CI `bake` job, `make check`); ignores `generated_at` and lens's random `training` variants |
| `index.json` changes shape in only one of `bake/.../index.py` and `web/src/lib/types.ts`, or a breaking change keeps the major | Partial: `lib.test.ts` reads the committed fixture through `checkIndex()`, which refuses a new major, and the fixture check keeps that fixture current. Nothing diffs the two type definitions. |
| The fixture looks like real data | `test_rules::test_the_fixture_stays_obviously_synthetic` (`provenance.source = "synthetic fixture"`); the "Sample data" badge is in `Lightbox.tsx` |
| The bake imports lens's server or CLI internals, or anything from cortex but the blob store | `test_rules::test_bake_imports_no_lens_server_internals_and_only_cortex_blobs` |
| A file in `web/vendor/dh/` is edited here | CI `dh-shared`; `shared.test.ts` for the strip |
| A raw colour outside the `--dh-accent`/`--dh-on-accent` override, or text below 12 px | `rules.test.ts` |
| Inline `<script>`, `<style>`, `dangerouslySetInnerHTML` or `next/script` | ESLint (`react/no-danger`, `no-restricted-syntax`, `no-restricted-imports` in `eslint.config.mjs`) |
| An inline `style` attribute or `<style>` in exported HTML (`style-src 'self'`) | `csp.mjs` fails the build; `csp.test.ts` |
| A third-party origin in the CSP (only the baked-data origin, for `connect-src`/`img-src`, and Cloudflare's Web Analytics script in `script-src`) | `csp.test.ts` |
| `main` carries a commit `dev` lacks (other than a release merge with `dev`'s tree) | CI `main-not-ahead` |

## Layout

- `bake/src/lightbox_bake/`: `cli.py` is the entry point; `index.py` holds `build_index` and documents the `index.json` contract at the top.
- `web/src/lib/`: pure, unit-tested logic (`types.ts` mirrors the contract). `web/src/components/`: `Lightbox.tsx` is the root.
- `web/scripts/`: post-build steps. `csp.mjs` always runs; `split-index.mjs` runs only with `LIGHTBOX_PRERENDER=1`.
- `web/public/data/`: the committed fixture bake. Web tests read it, so it doubles as a contract test between bake and web.
- `web/public/data-tape/`: the committed tape bake (205 CC0/PD photos, about 30 MB) that the hosted demo serves. `make pages` builds it; `.github/workflows/pages.yml` deploys `web/out/` to Cloudflare Pages. Re-bake with `make tape` (needs `CORTEX_PG_URL` and `CORTEX_S3_*`) after a bake change or lens bump.

## Commands

`make help` lists the targets. `make check` is what CI runs. After a bake change, run `make fixture` and commit the result. There's no host Node here; the Makefile falls back to `node:22-bookworm-slim` via Docker. Single tests: `cd bake && .venv/bin/pytest tests/test_bake.py::test_name -q`, `cd web && npx vitest run -t "name"`.

## Conventions & gotchas

- **`index.json` version** is currently `1.2`: an additive change is a minor bump, a breaking one a major.
- **A checked LLM rewrite** is stored as `caption.refine` and is not `explain.drift`; drift means the current assembly disagrees with the recorded caption.
- **Unclassified tags** that miss the hint list are still facets: a known gap goes under its category, the rest under `detail`. The lists are `facet_lists.example.json`; `FACET_LISTS_JSON` replaces that file.
- **The tape reader talks SQL to the lineage schema directly** (like lens's replay backend) and imports cortex only for the blob store, behind the `[tape]` extra.
- **Out of scope by design:** face grouping and content rating (that's argus-cull; `SuiteLinks.tsx` links to it). Training-dataset concerns stay in curator/forge.
- **Lens docs:** help links go to lens's README and `docs/` files at the baked version, all from `web/src/lib/lensDocs.ts`, until #21 imports them.
- **Style:** the Dragonhound shared layer is vendored in `web/vendor/dh/`; re-sync with `node scripts/sync-shared.mjs <this repo> --dest web/vendor/dh`. Use the token classes (`bg-base-800`, `text-text-secondary`, `text-link`, …). Dark-only by design (`data-dh-theme-lock`). Facet hues are one `--dh-cat-N` slot per group in `categories.ts`, mirrored as `[data-group]` properties in `globals.css` (`prerender.test.ts` keeps them in step); text on a tint uses the ink, and warnings use `text-warn-ink`/`bg-warn-tint`. Demo-state badges use `dh-badge` and the four shared labels. Favicons are the argus-lens package mark (argus-cortex `brand/packages/lens/`, dark variant).
- **Modern Web Guidance:** search Chrome's [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) skill before writing UI, CSS animation or browser-API code in `web/`, and re-run `npx -y modern-web-guidance@latest legacy-scan web/src` after big changes. House exceptions: the global reduced-motion rule zeroes every duration, and the dialog exit uses the `data-closing` fallback everywhere because React unmounts the dialog on `close`.
- **Prerender:** with `LIGHTBOX_PRERENDER=1` (`make pages`) the first grid page, counts and lens version are baked into the HTML, and the client fetches `list.json` and `detail/<id>.json`. Without it (`make build`, Docker) pages read `index.json` at runtime, because a folder gallery rewrites it while it captions. Per-photo colours are set through the CSSOM after hydration, never in the HTML.
- **CSP** is generated at build time with hashes of Next's inline scripts and a Trusted Types `default` policy that only accepts same-origin `/_next/static/**.js` URLs (Turbopack's chunk loader assigns strings to `script.src`). Adding a third-party origin means changing `csp.mjs` and its test; check a built page for `securitypolicyviolation` events. `next dev` runs without it.
- **View Transition:** opening a photo morphs the thumbnail (`photo-hero`). `PhotoDetail` calls `showModal()` in a layout effect so the dialog is showing inside the `flushSync`. Keep it that way.
- `react-hooks/refs` lint is on, so don't read refs during render. Python: ruff 0.15.16, line-length 120, py311.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and update them by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`.

A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected, the release is a reviewed PR from `dev`; its merge commit is the one commit `main` may have that `dev` lacks (same tree), so leave it and don't merge `main` back into `dev`. Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.
