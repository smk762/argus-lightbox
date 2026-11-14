// Gallery state lives in the URL so every filtered view and open photo is
// shareable: ?q=sunset&f=wardrobe:red+dress&f=lighting:sunset&photo=<id>&cloud=1

import type { Selection } from "./filter";
import type { WordField } from "./words";

/** Photos per grid page. */
export const PAGE_SIZE = 48;

export interface ViewState {
  query: string;
  selection: Selection;
  photo: string | null;
  /** Word cloud above the photo grid. */
  cloud: boolean;
  /** Caption words, or tagger phrases. */
  words: WordField;
  /** Current filter, or every photo in the index. */
  scope: "subset" | "source";
}

export function parseView(params: URLSearchParams): ViewState {
  const selection: Selection = {};
  for (const raw of params.getAll("f")) {
    const i = raw.indexOf(":");
    if (i <= 0 || i === raw.length - 1) continue;
    const group = raw.slice(0, i);
    const term = raw.slice(i + 1);
    const terms = (selection[group] ??= []);
    if (!terms.includes(term)) terms.push(term);
  }
  const words = params.get("words") === "tags" ? "tags" : "caption";
  const scope = params.get("scope") === "source" ? "source" : "subset";
  return {
    query: params.get("q") ?? "",
    selection,
    photo: params.get("photo") || null,
    cloud: params.get("cloud") === "1",
    words,
    scope,
  };
}

export function serializeView(view: ViewState): string {
  const params = new URLSearchParams();
  if (view.query.trim()) params.set("q", view.query.trim());
  for (const group of Object.keys(view.selection).sort()) {
    for (const term of view.selection[group]) params.append("f", `${group}:${term}`);
  }
  if (view.photo) params.set("photo", view.photo);
  if (view.cloud) params.set("cloud", "1");
  if (view.words === "tags") params.set("words", "tags");
  if (view.scope === "source") params.set("scope", "source");
  const s = params.toString();
  return s ? `?${s}` : "";
}
