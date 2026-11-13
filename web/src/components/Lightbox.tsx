"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { groupStyle } from "@/lib/categories";
import { loadIndex, loadStatus } from "@/lib/data";
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
import { WordCloud } from "./WordCloud";

const EMPTY: ViewState = { query: "", selection: {}, photo: null, cloud: false, words: "caption", scope: "subset" };
const PAGE_SIZE = 48;

function sourceBadge(source: string): { label: string; title: string; tone: string } {
  if (source === "fixture") {
    return {
      label: "Synthetic fixture",
      title: "Placeholder images with hand-written model output, captioned by lens's real pipeline",
      tone: "bg-warning/15 text-warning",
    };
  }
  if (source === "folder") {
    return {
      label: "Local folder",
      title: "Photos captioned from a folder mounted into this stack",
      tone: "bg-success/15 text-success",
    };
  }
  return {
    label: "Recorded pipeline run",
    title: "Captions recorded from a real pipeline run",
    tone: "bg-success/15 text-success",
  };
}

export function Lightbox() {
  const [index, setIndex] = useState<GalleryIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false); // small screens only; md+ always shows the sidebar
  const [queue, setQueue] = useState(0);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState("pose_composition");
  const [applying, setApplying] = useState(false);
  const [choiceNote, setChoiceNote] = useState<string | null>(null);
  // Whether the open photo pushed its own history entry (opened by click) or
  // arrived by deep link; closing pops the former and replaces the latter.
  const pushedPhoto = useRef(false);
  // How many photos the grid is showing. The status poll reads this so a click
  // is what pulls in captions that finished after the page loaded.
  const shownCount = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer = 0;
    let alive = true;

    const watch = async () => {
      try {
        const status = await loadStatus(ctrl.signal);
        if (!alive) return;
        setQueue(status.queue);
        setPending(Math.max(0, status.count - shownCount.current));
        if (status.queue > 0) timer = window.setTimeout(() => void watch(), 3000);
      } catch (e) {
        if (!alive || (e instanceof Error && e.name === "AbortError")) return;
        timer = window.setTimeout(() => void watch(), 3000);
      }
    };

    loadIndex(ctrl.signal)
      .then((next) => {
        if (!alive) return;
        shownCount.current = next.photos.length;
        setIndex(next);
        setQueue(next.queue ?? 0);
        setPending(0);
        if ((next.queue ?? 0) > 0) timer = window.setTimeout(() => void watch(), 3000);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });

    return () => {
      alive = false;
      ctrl.abort();
      window.clearTimeout(timer);
    };
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = filtered.length === 0 ? 0 : Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const applyCaption = useCallback(async (ids: string[], category: string) => {
    setApplying(true);
    setChoiceNote(null);
    try {
      const res = await fetch("/api/caption-choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, category }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; updated?: string[]; skipped?: { reason: string }[] };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const next = await loadIndex();
      shownCount.current = next.photos.length;
      setIndex(next);
      setQueue(next.queue ?? 0);
      const skipped = body.skipped?.length ?? 0;
      const updated = body.updated?.length ?? 0;
      if (skipped > 0) {
        setChoiceNote(`Updated ${updated}. ${skipped} ${skipped === 1 ? "photo has" : "photos have"} no ${groupStyle(category).label} caption.`);
      }
    } catch (e) {
      setChoiceNote(e instanceof Error ? e.message : "Could not update the caption");
    } finally {
      setApplying(false);
    }
  }, []);

  const reveal = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await loadIndex();
      shownCount.current = next.photos.length;
      setIndex(next);
      setQueue(next.queue ?? 0);
      setPending(0);
      if (!view.photo) {
        const shown = filterPhotos(
          next.photos,
          view.query,
          view.selection,
          new Map(next.photos.map((p) => [p.id, searchText(p)])),
        );
        setPage(shown.length === 0 ? 0 : Math.ceil(shown.length / PAGE_SIZE) - 1);
        document.getElementById("gallery-grid")?.scrollIntoView({ block: "start" });
      }
    } catch {
      // Keep the photos already on screen. The button stays so the click can be tried again.
    } finally {
      setRefreshing(false);
    }
  }, [view]);

  const openIndex = view.photo ? filtered.findIndex((p) => p.id === view.photo) : -1;
  const openPhoto = openIndex >= 0 ? filtered[openIndex] : view.photo ? photos.find((p) => p.id === view.photo) : undefined;

  const setSelection = (selection: Selection) => {
    setPage(0);
    update({ ...view, selection });
  };
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

  const badge = index ? sourceBadge(index.source) : null;

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
      {/* The facet sidebar puts dozens of checkboxes ahead of the photos in tab order. Focus moves
          without a fragment navigation, which would fire popstate and add a history entry. */}
      <a
        href="#gallery"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("gallery")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-base-800 focus:px-3 focus:py-2 focus:text-small"
      >
        Skip to photos
      </a>
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <h1 className="font-display text-display font-semibold tracking-tight">Lightbox</h1>
          <p className="text-small text-text-secondary">
            Every photo here is navigated by its{" "}
            <a href="https://github.com/smk762/argus-lens" className="text-accent-tertiary underline underline-offset-2 hover:decoration-2">
              argus-lens
            </a>{" "}
            structured caption.
          </p>
        </div>
        {index && badge && (
          <div className="flex items-center gap-2 text-caption text-text-secondary">
            <span className={`rounded-full px-2.5 py-1 ${badge.tone}`} title={badge.title}>
              {badge.label}
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

        <main id="gallery" tabIndex={-1} className="@container min-w-0 flex-1">
          <div className="sticky top-0 z-10 -mx-1 mb-4 bg-base-900/90 px-1 py-2 backdrop-blur">
            <input
              type="search"
              value={view.query}
              onChange={(e) => {
                setPage(0);
                update({ ...view, query: e.target.value });
              }}
              placeholder="Search captions: “red dress beach”, “neon”, “reading”…"
              aria-label="Search captions"
              className="w-full rounded-md border border-base-600 bg-base-800 px-4 py-2.5 text-body placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
              <span role="status" className="tabular-nums">
                {index ? `${filtered.length} of ${photos.length} photos` : "Loading…"}
              </span>
              {index && (
                <button
                  type="button"
                  aria-pressed={view.cloud}
                  onClick={() => update({ ...view, cloud: !view.cloud })}
                  className={`rounded-full px-2.5 py-1 ${view.cloud ? "bg-accent-primary font-medium text-base-900" : "border border-base-600 hover:bg-base-700"}`}
                >
                  Word cloud
                </button>
              )}
              {index && index.categories.length > 0 && (
                <>
                  <label className="flex items-center gap-1">
                    <span className="text-text-muted">Caption option</span>
                    <select
                      aria-label="Caption option"
                      value={index.categories.includes(choice) ? choice : index.categories[0]}
                      onChange={(e) => setChoice(e.target.value)}
                      className="rounded-md border border-base-600 bg-base-800 px-2 py-1 text-text-primary"
                    >
                      {index.categories.map((category) => (
                        <option key={category} value={category}>
                          {groupStyle(category).label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={applying || picked.size === 0}
                    onClick={() =>
                      void applyCaption([...picked], index.categories.includes(choice) ? choice : index.categories[0])
                    }
                    className="rounded-full bg-accent-primary px-3 py-1 font-medium text-base-900 disabled:opacity-40"
                  >
                    {applying ? "Updating captions…" : `Use for selected (${picked.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pageIds = visible.map((photo) => photo.id);
                      const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
                      setPicked((current) => {
                        const next = new Set(current);
                        for (const id of pageIds) {
                          if (allPicked) next.delete(id);
                          else next.add(id);
                        }
                        return next;
                      });
                    }}
                    className="rounded-full border border-base-600 px-2.5 py-1 hover:bg-base-700"
                  >
                    {visible.length > 0 && visible.every((photo) => picked.has(photo.id)) ? "Clear page" : "Select page"}
                  </button>
                </>
              )}
              {choiceNote && <span className="text-warning">{choiceNote}</span>}
              {queue > 0 && (
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning tabular-nums">
                  {queue} {queue === 1 ? "caption" : "captions"} in queue
                </span>
              )}
              {pending > 0 && (
                <button
                  type="button"
                  onClick={() => void reveal()}
                  disabled={refreshing}
                  className="rounded-full bg-accent-primary px-3 py-1 font-medium text-base-900 disabled:opacity-60"
                >
                  {refreshing ? "Loading new images…" : `Click here to show new images (${pending})`}
                </button>
              )}
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

          {view.cloud && (
            <WordCloud
              photos={view.scope === "source" ? photos : filtered}
              field={view.words}
              scope={view.scope}
              subsetCount={filtered.length}
              sourceCount={photos.length}
              onField={(words) => update({ ...view, words })}
              onScope={(scope) => update({ ...view, scope })}
              onSearch={(query) => {
                setPage(0);
                update({ ...view, query });
              }}
            />
          )}

          {index && filtered.length === 0 ? (
            <p className="py-16 text-center text-text-secondary">
              {photos.length === 0 && queue > 0
                ? "No captioned photos yet."
                : "No photos match. Try removing a filter. Terms within a category widen the search, categories narrow it."}
            </p>
          ) : (
            <div id="gallery-grid">
              <PhotoGrid
                photos={visible}
                selection={view.selection}
                picked={picked}
                onOpen={openFromGrid}
                onToggle={(id) =>
                  setPicked((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
              {filtered.length > PAGE_SIZE && (
                <nav className="mt-6 flex items-center justify-center gap-3 text-small" aria-label="Photo pages">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => {
                      setPage(safePage - 1);
                      document.getElementById("gallery-grid")?.scrollIntoView({ block: "start" });
                    }}
                    className="rounded-md border border-base-600 px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="tabular-nums text-text-secondary">
                    {pageStart + 1}–{pageStart + visible.length} of {filtered.length}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => {
                      setPage(safePage + 1);
                      document.getElementById("gallery-grid")?.scrollIntoView({ block: "start" });
                    }}
                    className="rounded-md border border-base-600 px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </nav>
              )}
            </div>
          )}
        </main>
      </div>

      {openPhoto && index && (
        <PhotoDetail
          photo={openPhoto}
          position={{ index: Math.max(openIndex, 0), total: Math.max(filtered.length, 1) }}
          categories={index.categories}
          terms={terms}
          applying={applying}
          onClose={() => {
            if (pushedPhoto.current) window.history.back();
            else update({ ...view, photo: null });
          }}
          onStep={step}
          onUseCaption={(category) => void applyCaption([openPhoto.id], category)}
        />
      )}
    </div>
  );
}
