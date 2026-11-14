# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`index.json` has its own contract version (currently `1.2`), documented in `bake/src/lightbox_bake/index.py`.

## [Unreleased]

### Added

- README links this UI's row in the suite's [What to run for which UI](https://studio.dragonhound.dev/docs/setup/which-services/#lightbox) matrix.
- `index.json` 1.1 adds an optional `caption_params`: the run settings recorded with every caption (prose model, prompt preset, refine model), written only when all photos agree. `/docs` shows them under the lens version.
- `index.json` 1.2 adds an optional per-photo `thumbs`: the grid thumbnail at 240 and 360 px wide as well as the 480 px one, narrowest first. The grid serves them with `srcset` and `sizes` matched to the column layout, so a phone downloads about a third of the thumbnail bytes it did. `lightbox-bake thumbs` adds them to an existing bake without re-captioning; the demo tape and the fixture were updated that way.

### Changed

- The hosted demo is re-captioned with argus-lens 0.11.0 using lens's `straightforward` prose prompt preset, not lens's default (`detailed`). The default wrote mood adjectives and "this is a … photograph" openers into the zero-shot captions and doubled the prose length (smk762/argus-lens#104).

## [0.1.0] - 2026-11-13

The first release: the standalone demo for argus-lens.

### Added

- **Gallery navigated by lens's structured captions.** Faceted filtering by lens's category buckets: terms within a category are OR'd and categories are AND'd. There are also headcount and camera facets, free-text search over every caption and the raw output, and all state in the URL.
  - Ordinary tags that miss the hint list still become facets: known gaps go under their category, the rest under `detail`. Rating, sexual and minor-related tags are never added.
  - The facet lists are loaded from JSON (`FACET_LISTS_JSON`).
  - Facet groups in the sidebar can be collapsed, and the choice is remembered per group.
- **Photo detail dialog:**
  - **Caption tab:** the final caption and every variant, with copy buttons and a token count that warns when a caption is over the target backend's budget.
  - **How it was built tab:** raw tags and prose, dropped meta tags, the category buckets, a per-variant trace, compaction notes and headcount evidence.
  - **Compare tab:** the same raw output assembled tags-only, prose-only and hybrid.
  - **Metadata tab:** EXIF (never GPS), provenance and licence, and the `.txt` and XMP sidecar downloads.
  - Swipe or use the arrow keys to move between photos. The grid thumbnail morphs into the detail image with a View Transition.
- **The grid and detail view show the zero-shot caption by default.** `NEXT_PUBLIC_DEFAULT_CAPTION` names another variant, or `final` for lens's own pick. This changes the display only.
- **Word cloud** of caption words or tags, over the current filter or the whole set, with a CSV histogram export.
- **`/docs` page and in-context lens help.**
  - `/docs` shows the lens version the gallery was baked with and links to PyPI, the source at that version, and lens's docs sections.
  - Each detail tab links to the matching lens section.
  - The Caption tab says which lens version, backend and refine model captioned the photo, taken from the recorded caption.
- **The bake (`lightbox-bake`):**
  - `fixture`: 12 synthetic scenes, captioned by lens's real assembly and committed as `web/public/data/`.
  - `tape`: the recorded pipeline run, read from the cortex lineage and blob stores.
  - `folder`: captions a photo directory through a lens server, with a sha256 caption cache.
  - `purge`.
  - Every bake re-runs lens's assembly on the raw output to explain it. The recorded caption stays what's shown, and a disagreement sets `explain.drift`. A rewrite lens checked and kept is recorded as `caption.refine` and is not counted as drift.
  - Quarry's licence and attribution are mapped onto provenance.
- **Your own photos with Docker Compose.**
  - `docker compose up --build` serves a gallery of `~/Pictures`, or `PHOTOS_DIR`, captioned by argus-lens 0.10.0 (`LENS_TAG` overrides). The gallery is published while captions are still being written.
  - Captioning is hybrid: RAM++ tags plus Florence prose, or an Ollama or ComfyUI vision model. With `OLLAMA_URL` set, captions are also refined. `compose.gpu.yaml` adds an NVIDIA GPU.
  - `CAPTION_CACHE_KEY` keeps each caption profile's cache apart. `make purge` starts over.
- **Choosing the final caption** in folder mode, for one photo or in bulk. It rewrites `index.json`, the XMP sidecar and the caption cache through `POST /api/caption-choice` on the folder server, and is refused while captions are queued.
- **Hosted demo** (`make pages`, Cloudflare Pages on every push to `main`). It holds 205 openly licensed photos captioned by argus-lens, with a demo banner, OG/Twitter metadata and a styled 404 page.
- **Security and privacy:**
  - GPS is never emitted, and renditions are re-encoded so no source metadata survives.
  - The static export gets a strict hash-based CSP with Trusted Types (`web/scripts/csp.mjs`).
  - `_headers` adds HSTS, frame, referrer and permissions policies.
  - External links open in a new tab without an opener or referrer.
- **Accessibility:** contrast, link underlines, target sizes, tab semantics, a skip link and reduced motion.
- **Docs:** README, `docs/cli.md` (every subcommand and flag, and running without Docker), and the Argus suite map in `CLAUDE.md`.
- **CI** on `dev` and `main`: ruff, pytest, eslint, tsc, vitest, the build, and the suite check.

[Unreleased]: https://github.com/smk762/argus-lightbox/compare/v0.1.0...dev
[0.1.0]: https://github.com/smk762/argus-lightbox/releases/tag/v0.1.0
