"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";

import { groupStyle } from "@/lib/categories";
import { loadDetail, loadList, loadStatus } from "@/lib/data";
import {
  EXTRA_GROUPS,
  type Selection,
  activeCount,
  facetCounts,
  filterPhotos,
  searchText,
  toggleTerm,
} from "@/lib/filter";
import type { PrerenderedGallery } from "@/lib/prerender";
import type { DetailFields, GridPhoto, ListIndex, Photo } from "@/lib/types";
import { PAGE_SIZE, type ViewState, parseView, serializeView } from "@/lib/urlState";

import { ExternalLink } from "./ExternalLink";
import { HostedDemoStrip } from "./DemoStrip";
import { DemoLinks } from "./SuiteLinks";
import { FacetSidebar } from "./FacetSidebar";
import { PhotoDetail } from "./PhotoDetail";
import { PhotoGrid } from "./PhotoGrid";
import { WordCloud } from "./WordCloud";

const EMPTY: ViewState = { query: "", selection: {}, photo: null, cloud: false, words: "caption", scope: "subset" };
const NO_FACETS: Record<string, never[]> = {};
const LINK = "text-link underline underline-offset-2 hover:decoration-2";
// The hosted demo is a static site, so the caption-choice write path has nowhere to go.
const READ_ONLY = Boolean(process.env.NEXT_PUBLIC_DEMO_BANNER);

/** The source badge, in the Dragonhound demo-state vocabulary (vendor/dh/README.md, dh-badge.css). */
function sourceBadge(source: string): { label: string; title: string; className: string } {
  if (source === "fixture") {
    return {
      label: "Sample data",
      title: "Synthetic fixture: placeholder images with hand-written model output, captioned by lens's real pipeline",
      className: "dh-badge dh-badge--sample",
    };
  }
  if (source === "folder") {
    // Not a demo state: a local gallery, captioned live from a mounted folder.
    return {
      label: "Local folder",
      title: "Photos captioned from a folder mounted into this stack",
      className: "dh-badge",
    };
  }
  return {
    label: "Recorded",
    title: "Recorded output from a real pipeline run; no model runs while you browse",
    className: "dh-badge",
  };
}

/**
 * The gallery. *initial* is the build-time first page, photo count and facet counts (a prerendered
 * static export, src/lib/prerender.ts): it renders in the HTML, and the photo list loads after.
 * Without it, everything waits for the index, as a folder gallery that is still captioning needs.
 */
export function Lightbox({ initial = null }: { initial?: PrerenderedGallery | null }) {
  const split = initial !== null;
  const [index, setIndex] = useState<ListIndex | null>(null);
  const [details, setDetails] = useState<Record<string, DetailFields | "error">>({});
  const [toolsOpen, setToolsOpen] = useState(false); // small screens only: the caption-choice controls
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
  const detailRequests = useRef(new Set<string>());

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

    loadList(split, ctrl.signal)
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
  }, [split]);

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

  const meta = index ?? initial?.meta ?? null;
  const photos = useMemo(() => index?.photos ?? [], [index]);
  const searchCache = useMemo(() => new Map(photos.map((p) => [p.id, searchText(p)])), [photos]);
  const groups = useMemo(() => [...(meta?.categories ?? []), ...EXTRA_GROUPS], [meta]);
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

  // Until the photo list arrives, a prerendered page shows its baked first page and facet counts,
  // as long as the view is the one they were baked for (no search, no filter, page one).
  const previewing = !index && initial !== null && !view.query.trim() && activeCount(view.selection) === 0 && page === 0;
  const matchCount = index ? filtered.length : previewing ? initial.total : 0;
  const totalCount = index ? photos.length : (initial?.total ?? 0);
  const shownFacets = index ? facets : previewing ? initial.facets : NO_FACETS;

  const pageCount = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const safePage = matchCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const visible: GridPhoto[] = index
    ? filtered.slice(pageStart, pageStart + PAGE_SIZE)
    : previewing
      ? initial.firstPage
      : [];

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
      const next = await loadList(split);
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
  }, [split]);

  const reveal = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await loadList(split);
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
  }, [view, split]);

  // Split exports fetch a photo's Explain/Compare data on demand: on hover or focus of its
  // thumbnail, when it opens, and for its neighbours so the arrow keys don't wait.
  const fetchDetail = useCallback(
    (id: string) => {
      if (!split || detailRequests.current.has(id)) return;
      detailRequests.current.add(id);
      loadDetail(id)
        .then((d) => setDetails((current) => ({ ...current, [id]: d })))
        .catch(() => setDetails((current) => ({ ...current, [id]: "error" })));
    },
    [split],
  );

  const openIndex = view.photo ? filtered.findIndex((p) => p.id === view.photo) : -1;
  const openPhoto = openIndex >= 0 ? filtered[openIndex] : view.photo ? photos.find((p) => p.id === view.photo) : undefined;
  const openDetail = openPhoto ? details[openPhoto.id] : undefined;
  const openFull: Photo | null =
    openPhoto?.explain && openPhoto.compare
      ? (openPhoto as Photo)
      : openPhoto && openDetail && openDetail !== "error"
        ? { ...openPhoto, ...openDetail }
        : null;
  const prevId = openIndex >= 0 && filtered.length > 1 ? filtered[(openIndex - 1 + filtered.length) % filtered.length].id : null;
  const nextId = openIndex >= 0 && filtered.length > 1 ? filtered[(openIndex + 1) % filtered.length].id : null;
  useEffect(() => {
    if (!openPhoto || openPhoto.explain) return;
    for (const id of [openPhoto.id, nextId, prevId]) if (id) fetchDetail(id);
  }, [openPhoto, nextId, prevId, fetchDetail]);

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

  const badge = meta ? sourceBadge(meta.source) : null;
  const goToPage = (next: number) => {
    setPage(next);
    document.getElementById("gallery-grid")?.scrollIntoView({ block: "start" });
  };

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-2 font-display text-heading font-semibold">Couldn&apos;t load the gallery</h1>
        <p className="text-text-secondary">{error}</p>
      </main>
    );
  }

  const categories = meta?.categories ?? [];
  const chosen = categories.includes(choice) ? choice : categories[0];
  const filterCount = activeCount(view.selection);

  return (
    <>
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
      <HostedDemoStrip />
      <div className="mx-auto flex min-h-dvh max-w-[1800px] flex-col px-4 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 py-6">
          <div>
            <h1 className="font-display text-display font-semibold tracking-tight">Lightbox</h1>
            <p className="text-small text-text-secondary">
              Every photo here is navigated by its{" "}
              <ExternalLink href="https://github.com/smk762/argus-lens" className={LINK}>
                argus-lens
              </ExternalLink>{" "}
              structured caption.
            </p>
          </div>
          {/* Fixed height: the badge row is in the HTML of a prerendered build and arrives with the
              index otherwise, and either way it must not push the grid down. */}
          <div className="flex min-h-7 flex-wrap items-center gap-3 text-caption text-text-secondary">
            {meta && badge && (
              <>
                <span className={badge.className} title={badge.title}>
                  {badge.label}
                </span>
                <span>lens {meta.lens_version}</span>
              </>
            )}
            <nav aria-label="Site">
              <Link href="/docs/" className={LINK}>
                Docs
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 pb-10 md:flex-row md:gap-6">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="facet-sidebar"
            className="min-h-11 self-start rounded-md border border-base-600 px-4 text-small md:hidden"
          >
            {filtersOpen ? "Hide filters" : `Filters${filterCount ? ` (${filterCount})` : ""}`}
          </button>
          <div
            id="facet-sidebar"
            className={`${filtersOpen ? "block" : "hidden"} md:sticky md:top-4 md:block md:h-[calc(100dvh-2rem)] md:w-64 md:shrink-0 md:overflow-y-auto md:pr-2`}
          >
            <FacetSidebar
              groups={groups}
              facets={shownFacets}
              selection={view.selection}
              onToggle={(group, term) => setSelection(toggleTerm(view.selection, group, term))}
              onClear={() => setSelection({})}
            />
            {/* Phones: the open filter list is long, so close it from the bottom as well as the top. */}
            <button
              type="button"
              onClick={() => {
                setFiltersOpen(false);
                document.getElementById("gallery")?.scrollIntoView({ block: "start" });
              }}
              className="mt-4 min-h-11 w-full rounded-md bg-accent-primary px-4 text-small font-medium text-base-900 md:hidden"
            >
              {index || previewing ? `Show ${matchCount} ${matchCount === 1 ? "photo" : "photos"}` : "Show photos"}
            </button>
          </div>

          <main id="gallery" tabIndex={-1} className="@container min-w-0 flex-1 scroll-mt-2">
            <div className="sticky top-0 z-10 -mx-1 mb-4 bg-base-900/90 px-1 py-2 backdrop-blur">
              <input
                type="search"
                value={view.query}
                onChange={(e) => {
                  setPage(0);
                  update({ ...view, query: e.target.value });
                }}
                // Short enough to show whole in a phone-width field.
                placeholder="Search captions, e.g. “neon night”"
                aria-label="Search captions"
                enterKeyHint="search"
                className="w-full rounded-md border border-base-600 bg-base-800 px-4 py-2.5 text-body placeholder:text-text-muted focus:border-accent-primary"
              />
              <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 text-caption text-text-secondary">
                <span role="status" className="tabular-nums">
                  {index || previewing ? `${matchCount} of ${totalCount} photos` : "Loading…"}
                </span>
                {meta && (
                  <button
                    type="button"
                    aria-pressed={view.cloud}
                    onClick={() => update({ ...view, cloud: !view.cloud })}
                    className={`min-h-8 rounded-full px-2.5 py-1 ${view.cloud ? "bg-accent-primary font-medium text-base-900" : "border border-base-600 hover:bg-base-700"}`}
                  >
                    Word cloud
                  </button>
                )}
                {meta && categories.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setToolsOpen((o) => !o)}
                      aria-expanded={toolsOpen}
                      aria-controls="caption-tools"
                      className="min-h-8 rounded-full border border-base-600 px-2.5 py-1 hover:bg-base-700 md:hidden"
                    >
                      {toolsOpen ? "Hide caption tools" : `Caption tools${picked.size ? ` (${picked.size})` : ""}`}
                    </button>
                    <div
                      id="caption-tools"
                      role="group"
                      aria-label="Choose final captions"
                      title="Pick photos with their checkboxes, then make one caption option their final caption."
                      className={`${toolsOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 md:flex md:w-auto`}
                    >
                      <p className="w-full text-text-muted md:hidden">
                        Make one caption option the final caption of the photos you tick.
                        {READ_ONLY && " This hosted demo is read-only, so saving only works in a local gallery."}
                      </p>
                      <label className="flex items-center gap-1">
                        <span className="text-text-muted">Caption option</span>
                        <select
                          aria-label="Caption option"
                          value={chosen}
                          onChange={(e) => setChoice(e.target.value)}
                          className="rounded-md border border-base-600 bg-base-800 px-2 py-1 text-text-primary"
                        >
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {groupStyle(category).label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={READ_ONLY || applying || picked.size === 0}
                        onClick={() => void applyCaption([...picked], chosen)}
                        className="min-h-8 rounded-full bg-accent-primary px-3 py-1 font-medium text-base-900 disabled:opacity-40"
                      >
                        {applying ? "Updating captions…" : `Use for selected (${picked.size})`}
                      </button>
                      {READ_ONLY && (
                        <span
                          className="dh-badge dh-badge--off"
                          title="Saving a caption choice needs a local gallery (docker compose up); this hosted demo is read-only"
                        >
                          Not in this demo
                        </span>
                      )}
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
                        className="min-h-8 rounded-full border border-base-600 px-2.5 py-1 hover:bg-base-700"
                      >
                        {visible.length > 0 && visible.every((photo) => picked.has(photo.id)) ? "Clear page" : "Select page"}
                      </button>
                    </div>
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
                      data-group={group}
                      className="flex min-h-8 items-center gap-1 rounded-full border border-(--group) px-2 py-0.5 hover:bg-base-700"
                      aria-label={`Remove filter ${groupStyle(group).label}: ${term}`}
                    >
                      <span className="text-text-muted">{groupStyle(group).label}:</span> {term} <span aria-hidden>✕</span>
                    </button>
                  )),
                )}
              </div>
            </div>

            {view.cloud && index && (
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

            {!index && !previewing ? (
              // Holds the grid's place while the index loads, so the footer doesn't jump.
              <p aria-busy="true" className="min-h-dvh py-16 text-center text-text-secondary">
                Loading photos…
              </p>
            ) : matchCount === 0 ? (
              <p className="py-16 text-center text-text-secondary">
                {photos.length === 0 && queue > 0
                  ? "No captioned photos yet."
                  : "No photos match. Try removing a filter. Terms within a category widen the search, categories narrow it."}
              </p>
            ) : (
              <div id="gallery-grid" className="scroll-mt-28">
                <PhotoGrid
                  photos={visible}
                  selection={view.selection}
                  picked={picked}
                  onOpen={openFromGrid}
                  onIntent={fetchDetail}
                  onToggle={(id) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
                {matchCount > PAGE_SIZE && (
                  <nav className="mt-6 flex items-center justify-between gap-3 text-small sm:justify-center" aria-label="Photo pages">
                    <button
                      type="button"
                      disabled={safePage === 0}
                      onClick={() => goToPage(safePage - 1)}
                      className="min-h-11 rounded-md border border-base-600 px-4 disabled:opacity-40"
                    >
                      <span aria-hidden>← </span>Previous
                    </button>
                    <span className="text-center tabular-nums text-text-secondary">
                      {pageStart + 1}–{pageStart + visible.length} of {matchCount}
                      <span className="block text-caption text-text-muted">
                        Page {safePage + 1} of {pageCount}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => goToPage(safePage + 1)}
                      className="min-h-11 rounded-md border border-base-600 px-4 disabled:opacity-40"
                    >
                      Next<span aria-hidden> →</span>
                    </button>
                  </nav>
                )}
              </div>
            )}
          </main>
        </div>

        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-base-700 py-4 text-caption leading-6 text-text-secondary">
          <Link href="/docs/" className={LINK}>
            Docs
          </Link>
          <ExternalLink href="https://github.com/smk762/argus-lightbox" className={LINK}>
            argus-lightbox on GitHub
          </ExternalLink>
          <DemoLinks className={LINK} />
        </footer>

        {openPhoto && index && (
          <PhotoDetail
            photo={openFull ?? openPhoto}
            detail={openFull ? "ready" : openDetail === "error" ? "error" : "loading"}
            position={{ index: Math.max(openIndex, 0), total: Math.max(filtered.length, 1) }}
            categories={index.categories}
            lensVersion={index.lens_version}
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
    </>
  );
}
