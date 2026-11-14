// Post-build: split a static export's index.json into a lean list plus per-photo detail.
//
// The grid, search and facets need every photo's caption text and facets, but only the detail
// view's Explain and Compare tabs read `explain` and `compare`, which are over half of index.json.
// With LIGHTBOX_PRERENDER=1 (`make pages`), this writes next to the exported index.json:
//
//   list.json            the index with `explain` and `compare` left out of every photo
//   detail/<id>.json     { explain, compare } for one photo, fetched when that photo opens
//
// index.json itself is left as the bake wrote it: it is still the contract (bake/.../index.py).
// The same switch makes the home page bake its first page of thumbnails and the facet counts into
// the HTML (src/lib/prerender.ts). A folder gallery rewrites its index while it captions, so the
// Docker build leaves the switch off and the page reads index.json at runtime.
//
//   node scripts/split-index.mjs [outDir]   (run by `npm run build`)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { localDataDir, prerenderEnabled } from "./data-dir.mjs";

export { localDataDir, prerenderEnabled };

export const DETAIL_FIELDS = ["explain", "compare"];

/**
 * @param {{ photos: Record<string, unknown>[] }} index
 * @returns {{ list: object, details: [string, object][] }}
 */
export function splitIndex(index) {
  const details = [];
  const photos = index.photos.map((photo) => {
    const slim = { ...photo };
    const detail = {};
    for (const field of DETAIL_FIELDS) {
      if (field in slim) detail[field] = slim[field];
      delete slim[field];
    }
    const id = String(photo.id);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`split-index: photo id ${JSON.stringify(id)} is not a safe file name`);
    details.push([id, detail]);
    return slim;
  });
  return { list: { ...index, photos }, details };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "out";
  const dir = localDataDir(process.env);
  if (!prerenderEnabled(process.env) || !dir) {
    console.log("split-index: skipped (LIGHTBOX_PRERENDER is off, or the data is not in the build)");
  } else {
    const root = join(out, dir);
    const file = join(root, "index.json");
    if (!existsSync(file)) throw new Error(`split-index: no ${file} to split`);
    const { list, details } = splitIndex(JSON.parse(readFileSync(file, "utf8")));
    writeFileSync(join(root, "list.json"), JSON.stringify(list));
    rmSync(join(root, "detail"), { recursive: true, force: true });
    mkdirSync(join(root, "detail"));
    for (const [id, detail] of details) writeFileSync(join(root, "detail", `${id}.json`), JSON.stringify(detail));
    console.log(`split-index: ${dir}/list.json and ${details.length} detail file(s)`);
  }
}
