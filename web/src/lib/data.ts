import { type GalleryIndex, SUPPORTED_INDEX_MAJOR } from "./types";

/** Where the baked data directory is served from: same origin by default, or an R2/CDN URL. */
export function dataUrl(): string {
  const base = process.env.NEXT_PUBLIC_DATA_URL || `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;
  return base.replace(/\/+$/, "");
}

export function assetUrl(path: string): string {
  return `${dataUrl()}/${path}`;
}

export class IndexVersionError extends Error {}

/** Reject an index from a newer, incompatible bake rather than mis-rendering it. */
export function checkIndex(index: GalleryIndex): GalleryIndex {
  const major = String(index.version ?? "").split(".")[0];
  if (major !== SUPPORTED_INDEX_MAJOR) {
    throw new IndexVersionError(
      `index.json is version ${index.version}; this build reads ${SUPPORTED_INDEX_MAJOR}.x. Re-bake or update the app.`,
    );
  }
  return index;
}

export async function loadIndex(signal?: AbortSignal): Promise<GalleryIndex> {
  const res = await fetch(`${dataUrl()}/index.json`, { signal });
  if (!res.ok) throw new Error(`could not load ${dataUrl()}/index.json (HTTP ${res.status})`);
  return checkIndex((await res.json()) as GalleryIndex);
}
