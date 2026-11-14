// Build-time gallery data for the static export (server components only: reads public/ from disk).
//
// With LIGHTBOX_PRERENDER=1 (`make pages`), the home page bakes its first page of thumbnails, the
// photo count and the facet counts into the HTML, and /docs bakes the lens version, so neither page
// shifts when the data arrives. The client then loads list.json (scripts/split-index.mjs) for
// search, facets and the other pages. Off (the default, and the Docker build), both pages read the
// index at runtime, as a folder gallery that is still captioning needs.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { localDataDir, prerenderEnabled } from "../../scripts/data-dir.mjs";

import { shownCaption } from "./caption";
import { checkIndex } from "./data";
import { EXTRA_GROUPS, type FacetTerm, facetCounts } from "./filter";
import type { GalleryIndex, GridPhoto, IndexMeta, Photo } from "./types";

export interface PrerenderedGallery {
  meta: IndexMeta;
  /** Photos in the whole index. */
  total: number;
  /** The first page of the unfiltered grid, as thumbnail cards. */
  firstPage: GridPhoto[];
  /** Facet counts with nothing selected. */
  facets: Record<string, FacetTerm[]>;
}

/** The baked index, when this build prerenders and the data is part of it; else null. */
export function buildTimeIndex(env: Record<string, string | undefined> = process.env): GalleryIndex | null {
  const dir = localDataDir(env);
  if (!prerenderEnabled(env) || !dir) return null;
  // Build-time read of the committed bake; not a file the server bundle needs to carry.
  const file = join(/* turbopackIgnore: true */ process.cwd(), "public", dir, "index.json");
  if (!existsSync(file)) throw new Error(`LIGHTBOX_PRERENDER is on but ${file} is missing`);
  return checkIndex(JSON.parse(readFileSync(file, "utf8")) as GalleryIndex);
}

export function indexMeta(index: GalleryIndex): IndexMeta {
  const { version, generated_at, source, lens_version, categories, caption_params } = index;
  return { version, generated_at, source, lens_version, categories, ...(caption_params ? { caption_params } : {}) };
}

/** Just what a thumbnail needs. The caption is the one the grid shows, so the card stays small. */
export function gridCard(photo: Photo): GridPhoto {
  const camera = photo.exif.camera;
  return {
    id: photo.id,
    thumb: photo.thumb,
    width: photo.width,
    height: photo.height,
    color: photo.color,
    facets: {},
    exif: camera ? { camera } : {},
    provenance: photo.provenance.title ? { title: photo.provenance.title } : {},
    caption: { final_caption: shownCaption(photo.caption).text, caption_variants: {} },
  };
}

export function prerenderGallery(index: GalleryIndex, pageSize: number): PrerenderedGallery {
  const groups = [...index.categories, ...EXTRA_GROUPS];
  return {
    meta: indexMeta(index),
    total: index.photos.length,
    firstPage: index.photos.slice(0, pageSize).map(gridCard),
    facets: Object.fromEntries(groups.map((g) => [g, facetCounts(index.photos, g, "", {})])),
  };
}
