// "How this caption was built": trace each raw-output fragment through lens's
// assembly into a variant. Computed here from the recomposed buckets rather than
// from CaptionResult.removed_phrases, which lists anything dropped from *any*
// variant and so over-reports for a single one.

import type { Photo } from "./types";

export type FragmentStatus = "kept" | "trimmed";

export interface TracedFragment {
  text: string;
  source: "tags" | "prose";
  category: string; // a lens category, or "unclassified"
  status: FragmentStatus;
}

export interface Trace {
  /** Raw tags that never reached a bucket: rating/meta tags (1girl, solo, …) lens strips as training noise. */
  stripped: string[];
  fragments: TracedFragment[];
}

const norm = (s: string) => s.toLowerCase().replace(/_/g, " ").trim();

export function splitTags(raw: string): string[] {
  return raw
    .split(",")
    .map(norm)
    .filter(Boolean);
}

/** Trace every bucketed fragment of *photo* into the variant *variant*. */
export function traceVariant(photo: Photo, variant: string): Trace {
  const text = norm(photo.caption.caption_variants[variant] ?? "");
  const { tags, prose } = photo.explain.buckets;
  const fragments: TracedFragment[] = [];
  const bucketed = new Set<string>();
  for (const [source, buckets] of [
    ["tags", tags],
    ["prose", prose],
  ] as const) {
    for (const [category, items] of Object.entries(buckets ?? {})) {
      for (const item of items) {
        const t = norm(item);
        if (!t) continue;
        if (source === "tags") bucketed.add(t);
        fragments.push({ text: item, source, category, status: text.includes(t) ? "kept" : "trimmed" });
      }
    }
  }
  const stripped = splitTags(photo.caption.raw_tags).filter((t) => !bucketed.has(t));
  return { stripped: [...new Set(stripped)], fragments };
}
