"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { groupStyle } from "@/lib/categories";
import { loadIndex } from "@/lib/data";
import {
  EXTRA_GROUPS,
  type Selection,
  activeCount,
  facetCounts,
  filterPhotos,
  searchText,
  toggleTerm,
} from "@/lib/filter";
import type { GalleryIndex } from "@/lib/types";
import { type ViewState, parseView, serializeView } from "@/lib/urlState";

import { FacetSidebar } from "./FacetSidebar";
import { PhotoDetail } from "./PhotoDetail";
import { PhotoGrid } from "./PhotoGrid";

const EMPTY: ViewState = { query: "", selection: {}, photo: null };

export function Lightbox() {
  const [index, setIndex] = useState<GalleryIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false); // small screens only; md+ always shows the sidebar
  // Whether the open photo pushed its own history entry (opened by click) or
  // arrived by deep link; closing pops the former and replaces the latter.
  const pushedPhoto = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    loadIndex(ctrl.signal)
      .then(setIndex)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, []);

  // URL is the source of truth for shareable state; history entries are pushed
  // only when a photo opens or closes, so Back closes the viewer.
  useEffect(() => {
    const sync = () => {
      pushedPhoto.current = false;
      setView(parseView(new URLSearchParams(window.location.search)));
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const update = useCallback((next: ViewState, push = false) => {
    setView(next);
    const url = `${window.location.pathname}${serializeView(next)}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const photos = useMemo(() => index?.photos ?? [], [index]);
  const searchCache = useMemo(() => new Map(photos.map((p) => [p.id, searchText(p)])), [photos]);
  const groups = useMemo(() => [...(index?.categories ?? []), ...EXTRA_GROUPS], [index]);
  const filtered = useMemo(
    () => filterPhotos(photos, view.query, view.selection, searchCache),
    [photos, view.query, view.selection, searchCache],
  );
  const facets = useMemo(
    () =>
      Object.fromEntries(groups.map((g) => [g, facetCounts(photos, g, view.query, view.selection, searchCache)])),
    [photos, groups, view.query, view.selection, searchCache],
  );
  const terms = useMemo(
    () => [...view.query.split(/\s+/), ...Object.values(view.selection).flat()],
    [view.query, view.selection],
  );

  const openIndex = view.photo ? filtered.findIndex((p) => p.id === view.photo) : -1;
  const openPhoto = openIndex >= 0 ? filtered[openIndex] : view.photo ? photos.find((p) => p.id === view.photo) : undefined;

  const setSelection = (selection: Selection) => update({ ...view, selection });
  const step = useCallback(
    (delta: 1 | -1) => {
      if (filtered.length === 0) return;
      const i = openIndex < 0 ? 0 : (openIndex + delta + filtered.length) % filtered.length;
      update({ ...view, photo: filtered[i].id });
    },
    [filtered, openIndex, update, view],
  );

  // Open from the grid, morphing the thumbnail into the detail image where View
  // Transitions are available. The thumbnail carries the shared name only for the
  // old snapshot; it's dropped before the new one, where the detail <img> has it.
  const openFromGrid = (id: string, thumb: HTMLImageElement | null) => {
    const open = () => {
      pushedPhoto.current = true;
      update({ ...view, photo: id }, true);
    };
    if (!thumb || !("startViewTransition" in document) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      open();
      return;
    }
    thumb.style.viewTransitionName = "photo-hero";
    document.startViewTransition(() => {
      thumb.style.viewTransitionName = "";
      flushSync(open);
    });
  };

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-2 font-display text-heading font-semibold">Couldn&apos;t load the gallery</h1>
        <p className="text-text-secondary">{error}</p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1800px] flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <h1 className="font-display text-display font-semibold tracking-tight">Lightbox</h1>
          <p className="text-small text-text-secondary">
            Every photo here is navigated by its{" "}
            <a href="https://github.com/smk762/argus-lens" className="text-accent-tertiary hover:underline">
              argus-lens
            </a>{" "}
            structured caption.
          </p>
        </div>
        {index && (
          <div className="flex items-center gap-2 text-caption text-text-secondary">
            <span
              className={`rounded-full px-2.5 py-1 ${
                index.source === "fixture" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
              }`}
              title={
                index.source === "fixture"
                  ? "Placeholder images with hand-written model output, captioned by lens's real pipeline"
                  : "Captions recorded from a real pipeline run"
              }
            >
              {index.source === "fixture" ? "Synthetic fixture" : "Recorded pipeline run"}
            </span>
            <span>lens {index.lens_version}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 pb-10 md:flex-row md:gap-6">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="facet-sidebar"
          className="self-start rounded-md border border-base-600 px-3 py-1.5 text-small md:hidden"
        >
          {filtersOpen ? "Hide filters" : `Filters${activeCount(view.selection) ? ` (${activeCount(view.selection)})` : ""}`}
        </button>
        <div
          id="facet-sidebar"
          className={`${filtersOpen ? "block" : "hidden"} md:sticky md:top-4 md:block md:h-[calc(100dvh-2rem)] md:w-64 md:shrink-0 md:overflow-y-auto md:pr-2`}
        >
          <FacetSidebar
            groups={groups}
            facets={facets}
            selection={view.selection}
            onToggle={(group, term) => setSelection(toggleTerm(view.selection, group, term))}
            onClear={() => setSelection({})}
          />
        </div>

        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-10 -mx-1 mb-4 bg-base-900/90 px-1 py-2 backdrop-blur">
            <input
              type="search"
              value={view.query}
              onChange={(e) => update({ ...view, query: e.target.value })}
              placeholder="Search captions: “red dress beach”, “neon”, “reading”…"
              aria-label="Search captions"
              className="w-full rounded-md border border-base-600 bg-base-800 px-4 py-2.5 text-body placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
              <span className="tabular-nums">
                {index ? `${filtered.length} of ${photos.length} photos` : "Loading…"}
              </span>
              {Object.entries(view.selection).flatMap(([group, ts]) =>
                ts.map((term) => (
                  <button
                    key={`${group}:${term}`}
                    type="button"
                    onClick={() => setSelection(toggleTerm(view.selection, group, term))}
                    className="flex items-center gap-1 rounded-full border px-2 py-0.5 hover:bg-base-700"
                    style={{ borderColor: groupStyle(group).color }}
                    aria-label={`Remove filter ${groupStyle(group).label}: ${term}`}
                  >
                    <span className="text-text-muted">{groupStyle(group).label}:</span> {term} <span aria-hidden>✕</span>
                  </button>
                )),
              )}
            </div>
          </div>

          {index && filtered.length === 0 ? (
            <p className="py-16 text-center text-text-secondary">
              No photos match. Try removing a filter. Terms within a category widen the search, categories narrow it.
            </p>
          ) : (
            <PhotoGrid photos={filtered} selection={view.selection} onOpen={openFromGrid} />
          )}
        </main>
      </div>

      {openPhoto && index && (
        <PhotoDetail
          photo={openPhoto}
          position={{ index: Math.max(openIndex, 0), total: Math.max(filtered.length, 1) }}
          categories={index.categories}
          terms={terms}
          onClose={() => {
            if (pushedPhoto.current) window.history.back();
            else update({ ...view, photo: null });
          }}
          onStep={step}
        />
      )}
    </div>
  );
}
