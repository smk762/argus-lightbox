// Which grid thumbnails load eagerly, and which get fetchpriority=high.
//
// The grid is CSS columns, so DOM order runs down the first column before the second: the top of
// column two is item ~24 of 48 at two columns, not item 1. This estimates where each column starts
// from the thumbnails' aspect ratios (columns balance by height) at every column count the grid
// uses, so the first screen of every column loads eagerly. Pure, unit-tested.

/** Column counts the grid uses: columns-2, sm:columns-3, 2xl:columns-4. */
const COLUMN_COUNTS = [2, 3, 4];

/**
 * How far down a column (in column widths) counts as the first screen on a phone: a 390 px screen
 * shows about 450 px of grid under the header, and a column is about 180 px wide. Wider layouts load
 * their column tops eagerly and leave the rest to native lazy loading, which still fetches
 * in-viewport images at first layout. Each eager image is also preloaded by React, and on a slow
 * phone link every extra one delays the LCP image, so this stays tight.
 */
const FOLD = 2.5;

/** The gap under each thumbnail (mb-3, 12 px) in column widths at phone size, where the estimate matters most. */
const GAP = 0.07;

/**
 * The grid column's CSS width at each breakpoint, for `<img sizes>`. Mirrors the layout:
 * page `px-4` (`sm:px-6`) inside `max-w-[1800px]`; from `md` a 256 px sidebar (`md:w-64`) and a
 * 24 px gap (`md:gap-6`); `columns-2 sm:columns-3 2xl:columns-4` with 12 px column gaps (`gap-3`).
 * At 390 px that is about 173 px, at 700 px about 209 px, and at 1440 px about 363 px.
 */
export const THUMB_SIZES = [
  "(min-width: 1536px) calc((min(100vw, 1800px) - 364px) / 4)",
  "(min-width: 768px) calc((100vw - 352px) / 3)",
  "(min-width: 640px) calc((100vw - 72px) / 3)",
  "calc((100vw - 44px) / 2)",
].join(", ");

/** `srcset` for a thumbnail's renditions, or undefined for a bake older than index 1.2 (just `thumb`). */
export function thumbSrcSet(thumbs: { src: string; width: number }[] | undefined, url: (path: string) => string) {
  if (!thumbs || thumbs.length < 2) return undefined;
  return thumbs.map((t) => `${url(t.src)} ${t.width}w`).join(", ");
}

export interface ThumbLoading {
  eager: boolean;
  high: boolean;
}

/** Column of each item when items fill columns of height *height* in order, or null if they don't fit. */
function fill(ratios: number[], columns: number, height: number): number[] | null {
  const out: number[] = [];
  let column = 0;
  let used = 0;
  for (const ratio of ratios) {
    if (used > 0 && used + ratio > height) {
      column += 1;
      used = 0;
      if (column >= columns) return null;
    }
    out.push(column);
    used += ratio;
  }
  return out;
}

/**
 * Offset of each item within its column, in column widths. Like the browser's column balancing with
 * break-inside-avoid: the shortest column height that fits every item, filled in order.
 */
function columnOffsets(ratios: number[], columns: number): { offset: number; top: boolean }[] {
  const total = ratios.reduce((a, b) => a + b, 0);
  let lo = Math.max(total / columns, ...ratios, 0);
  let hi = total;
  for (let i = 0; i < 40 && hi - lo > 1e-3; i++) {
    const mid = (lo + hi) / 2;
    if (fill(ratios, columns, mid)) hi = mid;
    else lo = mid;
  }
  const assigned = fill(ratios, columns, hi) ?? ratios.map(() => 0);
  const out: { offset: number; top: boolean }[] = [];
  let used = 0;
  assigned.forEach((column, i) => {
    if (i === 0 || column !== assigned[i - 1]) used = 0;
    out.push({ offset: used, top: used === 0 });
    used += ratios[i];
  });
  return out;
}

/**
 * Loading hints for a page of thumbnails. `eager` for the first phone screen of each column at two
 * columns and the top of every column at three and four; `high` for the top of each column at two
 * columns (phones, where the network is the bottleneck and the largest first-screen image is the LCP).
 */
export function thumbLoading(sizes: { width: number; height: number }[]): ThumbLoading[] {
  const ratios = sizes.map(({ width, height }) => (width > 0 && height > 0 ? height / width : 1) + GAP);
  const out = ratios.map(() => ({ eager: false, high: false }));
  for (const columns of COLUMN_COUNTS) {
    columnOffsets(ratios, columns).forEach(({ offset, top }, i) => {
      if (columns === 2 ? offset < FOLD : top) out[i].eager = true;
      if (top && columns === 2) out[i].high = true;
    });
  }
  return out;
}
