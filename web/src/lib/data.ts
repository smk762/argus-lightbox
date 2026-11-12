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

export interface GalleryStatus {
  queue: number;
  count: number;
  generated_at: string;
}

export async function loadIndex(signal?: AbortSignal): Promise<GalleryIndex> {
  const res = await fetch(`${dataUrl()}/index.json`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`could not load ${dataUrl()}/index.json (HTTP ${res.status})`);
  return checkIndex((await res.json()) as GalleryIndex);
}

/** Queue and photo count, without the photo list. Folder bakes rewrite this as captions finish. */
export async function loadStatus(signal?: AbortSignal): Promise<GalleryStatus> {
  const res = await fetch(`${dataUrl()}/status.json`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`could not load ${dataUrl()}/status.json (HTTP ${res.status})`);
  const body = (await res.json()) as Partial<GalleryStatus>;
  return {
    queue: typeof body.queue === "number" ? body.queue : 0,
    count: typeof body.count === "number" ? body.count : 0,
    generated_at: typeof body.generated_at === "string" ? body.generated_at : "",
  };
}
