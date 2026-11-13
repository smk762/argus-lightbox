# Command-line reference

The bake is a Python package in `bake/` (`make install` creates `bake/.venv`). It has one command, `lightbox-bake`, with four subcommands. It also has a small server, `python -m lightbox_bake.serve`. Docker Compose runs both for you (see the README). This page is for running them directly.

## `lightbox-bake fixture`

Bakes the synthetic fixture: 12 drawn scenes captioned by lens's real assembly. No model, GPU or tape is needed.

| Flag | Default | |
|---|---|---|
| `--out` | `web/public/data` | Output directory. `make fixture` writes here, and the result is committed. |

## `lightbox-bake tape`

Bakes the recorded pipeline run from a cortex lineage store and blob store. Needs the `[tape]` extra.

| Flag | Default | |
|---|---|---|
| `--out` | `web/public/data-tape` | Output directory. |
| `--pg-url` | `$CORTEX_PG_URL` | Lineage store URL. Required, either as the flag or as the variable. |
| `--dataset` | (all) | Only captions in this curated dataset. |
| `--limit` | (all) | Bake at most N assets. |

The blob store is read from `CORTEX_S3_ENDPOINT`, `CORTEX_S3_BUCKET` and the usual S3 credentials.

## `lightbox-bake folder`

Walks a photo directory, sends each image that has no cached caption to a lens server's `POST /caption`, and writes the gallery as it goes. Nothing is written into the photo directory.

| Flag | Default | |
|---|---|---|
| `--photos` | (required) | Directory of images: local, a mounted NAS share, or a USB drive. |
| `--out` | `web/public/data-folder` | Output directory. |
| `--lens-url` | `$LENS_URL`, else `http://127.0.0.1:8100` | The lens server. |
| `--cache` | (none) | Caption cache directory. Captions are stored by sha256, so unchanged photos are not sent again. Without it, every run captions everything. |
| `--limit` | (all) | Caption at most N images, in sorted path order. |
| `--no-recursive` | | Only the top level of `--photos`. |
| `--recaption` | | Ignore the cache and ask lens again. |

Environment:

| Variable | |
|---|---|
| `LENS_URL` | Default for `--lens-url`. |
| `CAPTION_CACHE_KEY` | Caption-profile name added to cache file names (`<sha256>.<key>.json`), so captions from a different backend or model are not reused. Unset or empty means `<sha256>.json`. Compose derives it from the backend and model settings. |
| `FACET_LISTS_JSON` | Path to a replacement for `facet_lists.example.json`. A missing file keeps the example. |

Example: a lens server on this machine and a folder in your home directory.

```bash
cd bake
export LENS_URL=http://127.0.0.1:8100
.venv/bin/lightbox-bake folder --photos ~/Pictures --out ../web/public/data-folder --cache ~/.cache/lightbox
```

To view the result, either point the dev server at it (`NEXT_PUBLIC_DATA_URL=/data-folder make dev`, read-only), or build the export and serve it as below, which is the only way to get final-caption choice.

## `lightbox-bake purge`

| Flag | |
|---|---|
| `--root` | Directory that contains `data/` and `cache/`. Both are deleted. Nothing else under it is touched. |

`make purge` runs this against `/var/lib/lightbox` in the container.

## `python -m lightbox_bake.serve`

Serves the Next static export with a baked data directory mounted at `/data`. Until `index.json` exists it answers `/` with a status page. It is also the only server that implements `POST /api/caption-choice`. The request body is `{"ids": [...], "category": "<variant>"}`. It changes the final caption in `index.json`, the XMP sidecar and, with `--cache`, the caption cache. It answers 409 while captions are still queued.

| Flag | Default | |
|---|---|---|
| `--html` | (required) | The static export (`web/out`). |
| `--data` | (required) | The baked data directory. |
| `--cache` | (none) | Caption cache to keep in step with chosen captions. |
| `--host` | `0.0.0.0` | |
| `--port` | `3000` | |

```bash
make build
cd bake && .venv/bin/python -m lightbox_bake.serve --html ../web/out --data ../web/public/data-folder --cache ~/.cache/lightbox
```
