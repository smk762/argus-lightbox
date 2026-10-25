// Gallery state lives in the URL so every filtered view and open photo is
// shareable: ?q=sunset&f=wardrobe:red+dress&f=lighting:sunset&photo=<id>

import type { Selection } from "./filter";

export interface ViewState {
  query: string;
  selection: Selection;
  photo: string | null;
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
  return { query: params.get("q") ?? "", selection, photo: params.get("photo") || null };
}

export function serializeView(view: ViewState): string {
  const params = new URLSearchParams();
  if (view.query.trim()) params.set("q", view.query.trim());
  for (const group of Object.keys(view.selection).sort()) {
    for (const term of view.selection[group]) params.append("f", `${group}:${term}`);
  }
  if (view.photo) params.set("photo", view.photo);
  const s = params.toString();
  return s ? `?${s}` : "";
}
