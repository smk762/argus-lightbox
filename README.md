# Argus Lightbox

A photo gallery you navigate by **structured captions**. Every photo is captioned by [argus-lens](https://github.com/smk762/argus-lens). Instead of one flat string, lens produces category-bucketed captions (identity, wardrobe, pose, setting, lighting, action), and Lightbox turns those buckets into filters. You can pick "red dress" under *Wardrobe* and "sunset" under *Lighting*, open a photo, and see how lens assembled its caption from the raw model output.

It's the standalone demo for argus-lens, the way argus-realms is for argus-atlas. The full pipeline UI is [Argus Studio](https://github.com/smk762/argus-studio).

![Filtering by lighting](docs/images/gallery-filtered.png)

| How a caption was built | Same raw output, assembled three ways |
|---|---|
| ![Explain tab](docs/images/detail-explain.png) | ![Compare tab](docs/images/detail-compare.png) |

## What it shows

- **Faceted filtering from lens's category buckets.** The filters aren't keyword matches. They're the tag fragments lens classified into each category. Terms within a category widen the results (OR), and categories narrow them (AND). A photo card shows which of its terms matched. There's also a headcount facet (lens's subject estimate) and a camera facet from EXIF.
- **Free-text search** across the final caption, every variant, and the raw model output.
- **The caption and its variants:** one per category, plus the `training` (identity-suppressed) and `zeroshot` variants, with copy buttons and the active filters highlighted.
- **How it was built.** Raw tags and prose, which tags were dropped as meta noise (`1girl`, `solo`), how fragments were classified, and which ones each variant kept or trimmed, plus lens's own compaction notes and headcount evidence.
- **Compare.** The same raw output assembled tags-only, prose-only and hybrid. No model is re-run, which shows that the value is in the assembly, not the model.
- **Metadata and sidecars.** EXIF (camera, lens, exposure; **never GPS**), provenance and licence, and the two sidecars lens writes: the `.txt` caption trainers read, and an XMP file (keywords + description) for Lightroom, digiKam and Immich.

Face grouping and NudeNet content rating are deliberately left out. They belong to curation, in [argus-curator](https://github.com/smk762/argus-curator), and the gallery links there.

## How it works

```
cortex lineage store ──▶ bake/ (Python) ──▶ web/public/data/ ──▶ web/ (Next.js static export)
  recorded captions        re-run lens assembly    index.json            no server, no API
  + image blobs            on the raw output (CPU) images/ thumbs/ xmp/
```

The site is **fully static**. A bake step does all the work ahead of time:

1. It reads the **recorded pipeline run** (the "tape" that [argus-halo](https://github.com/smk762/argus-halo) seeds the public demo with): the latest caption per asset from the cortex lineage store, and image bytes from the cortex blob store.
2. It re-runs lens's `compose_caption_result()` on each caption's stored raw tags and prose. This needs no model or GPU, and it recovers the intermediate assembly state the tape doesn't store: the per-category buckets, compaction notes, headcount, and the tags/prose/hybrid comparison. The **recorded** caption stays what's displayed. If the pinned lens release would now assemble it differently, the photo is flagged (`explain.drift`).
3. It writes web renditions (WebP display image + thumbnail, re-encoded so no source metadata survives), display-ready EXIF with GPS dropped, the XMP sidecar lens would write, and `index.json`.

The web app loads `index.json` and does everything else client-side. All gallery state (search, filters, the open photo) lives in the URL, so any view can be shared.

### The fixture

`web/public/data/` holds a committed **synthetic fixture**: 12 drawn placeholder scenes with hand-written WD14/Florence-style raw output, captioned by lens's real pipeline. It lets the app run and be tested without the tape, and it's labelled "Synthetic fixture" in the UI. The real data comes from `make tape`.

## Quick start

Needs [uv](https://docs.astral.sh/uv/). Node 22 is optional: the Makefile runs npm in the `node:22` Docker image when `npm` isn't on your PATH.

```bash
make install     # bake venv + web dependencies
make dev         # http://localhost:3000, serving the committed fixture
```

Bake the real run from a cortex store, for example the local stores you recorded the tape from:

```bash
export CORTEX_PG_URL=postgresql://…                       # lineage store
export CORTEX_S3_ENDPOINT=… CORTEX_S3_BUCKET=argus-tape   # blob store (plus credentials)
make tape                                                 # → web/public/data-tape/ (gitignored)
NEXT_PUBLIC_DATA_URL=/data-tape make dev
```

`lightbox-bake tape --dataset <name>` restricts the bake to one curated dataset, and `--limit N` caps it.

## Deploying

`make build` writes a static site to `web/out/`. Serve it from anything.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_DATA_URL` | `<basePath>/data` | Where `index.json` and the renditions live. Point it at an R2/CDN URL to host the data separately from the app; that origin must send CORS headers for `index.json`. |
| `NEXT_PUBLIC_BASE_PATH` | (none) | Serve the app under a sub-path. |
| `NEXT_PUBLIC_SUITE_URL` | argus-studio repo | The "see the whole pipeline" link. |
| `NEXT_PUBLIC_CURATOR_URL` | argus-curator repo | The faces / content-rating cross-link. Switch it to the curator demo once that exists. |

These are build-time variables (inlined by Next.js), so rebuild after changing them.

## Develop

```bash
make test        # bake pytest + web vitest (runs against the committed fixture)
make lint        # ruff + eslint + tsc
make check       # lint + test + build: what CI runs
make fixture     # re-bake the fixture after changing bake/ or bumping lens
```

## Roadmap

- **Live mode:** caption your own photo against a lens server you run, rendered with the same UI. The `caption` record already uses lens's `CaptionResult` field names, so a `/caption` response fits it directly.
- Bake the halo tape and publish it, with the app on Cloudflare Pages and the data on R2.
- Link to the curator demo once it exists ([argus-curator#17](https://github.com/smk762/argus-curator/issues/17), [#18](https://github.com/smk762/argus-curator/issues/18)).

## License

MIT
