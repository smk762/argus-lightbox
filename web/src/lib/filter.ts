// Faceted filtering over the baked index. Pure functions, unit-tested.
//
// Semantics are the usual faceted-search ones: terms within a group are OR'd
// ("red dress" or "jeans"), groups are AND'd (wardrobe AND lighting), and a
// group's counts are computed with every *other* group's selection applied, so
// picking a term never zeroes out its siblings.

import type { GridPhoto, ListPhoto } from "./types";

export type Selection = Record<string, string[]>;

/** Facet groups beyond lens's caption categories. */
export const EXTRA_GROUPS = ["detail", "people", "camera"] as const;

/** The facet terms *photo* carries for *group*. */
export function photoTerms(photo: Pick<GridPhoto, "facets" | "exif">, group: string): string[] {
  if (group === "camera") return photo.exif.camera ? [photo.exif.camera] : [];
  return photo.facets[group] ?? [];
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/_/g, " ");
}

/** Everything free-text search looks at: the caption, every variant, and the raw model output. */
export function searchText(photo: ListPhoto): string {
  const c = photo.caption;
  return normalise(
    [c.final_caption, ...Object.values(c.caption_variants), c.raw_tags, c.raw_prose, photo.exif.camera ?? ""].join(
      " \n ",
    ),
  );
}

/** True when every whitespace-separated query token appears somewhere in the photo's caption text. */
export function matchesQuery(photo: ListPhoto, query: string, cache?: Map<string, string>): boolean {
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  let text = cache?.get(photo.id);
  if (text === undefined) {
    text = searchText(photo);
    cache?.set(photo.id, text);
  }
  return tokens.every((t) => text.includes(t));
}

function matchesSelection(photo: ListPhoto, selection: Selection, skipGroup?: string): boolean {
  for (const [group, terms] of Object.entries(selection)) {
    if (group === skipGroup || terms.length === 0) continue;
    const have = photoTerms(photo, group);
    if (!terms.some((t) => have.includes(t))) return false;
  }
  return true;
}

export function filterPhotos<P extends ListPhoto>(
  photos: P[],
  query: string,
  selection: Selection,
  cache?: Map<string, string>,
): P[] {
  return photos.filter((p) => matchesSelection(p, selection) && matchesQuery(p, query, cache));
}

export interface FacetTerm {
  term: string;
  count: number;
  selected: boolean;
}

/** Terms for *group* with counts under every other active filter, most common first. Selected terms always stay listed. */
export function facetCounts(
  photos: ListPhoto[],
  group: string,
  query: string,
  selection: Selection,
  cache?: Map<string, string>,
): FacetTerm[] {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (!matchesSelection(photo, selection, group) || !matchesQuery(photo, query, cache)) continue;
    for (const term of new Set(photoTerms(photo, group))) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const selected = selection[group] ?? [];
  for (const term of selected) if (!counts.has(term)) counts.set(term, 0);
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count, selected: selected.includes(term) }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

export function toggleTerm(selection: Selection, group: string, term: string): Selection {
  const current = selection[group] ?? [];
  const next = current.includes(term) ? current.filter((t) => t !== term) : [...current, term];
  const out = { ...selection };
  if (next.length) out[group] = next;
  else delete out[group];
  return out;
}

export function activeCount(selection: Selection): number {
  return Object.values(selection).reduce((n, terms) => n + terms.length, 0);
}
