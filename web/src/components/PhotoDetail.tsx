"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { shownCaption } from "@/lib/caption";
import { assetUrl } from "@/lib/data";
import { swipeStep } from "@/lib/gesture";
import type { Photo } from "@/lib/types";

import { CaptionTab } from "./detail/CaptionTab";
import { CompareTab } from "./detail/CompareTab";
import { ExplainTab } from "./detail/ExplainTab";
import { MetadataTab } from "./detail/MetadataTab";

const TABS = [
  { key: "caption", label: "Caption" },
  { key: "explain", label: "How it was built" },
  { key: "compare", label: "Compare" },
  { key: "metadata", label: "Metadata" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function PhotoDetail({
  photo,
  position,
  categories,
  lensVersion,
  terms,
  applying,
  onClose,
  onStep,
  onUseCaption,
}: {
  photo: Photo;
  position: { index: number; total: number };
  categories: string[];
  lensVersion: string;
  terms: string[];
  applying: boolean;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  onUseCaption: (category: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("caption");

  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);

  // Layout effect, not a passive one: Lightbox opens the detail inside a view
  // transition with flushSync, and the dialog has to be showing before the
  // transition captures the new state.
  useLayoutEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Play the exit transition (globals.css, `data-closing`) before closing: once
  // the dialog closes, Lightbox unmounts it and there's nothing left to animate.
  const requestClose = useCallback(async () => {
    const el = dialog.current;
    if (!el?.open || el.hasAttribute("data-closing")) return;
    el.setAttribute("data-closing", "");
    const running = el.getAnimations({ subtree: true });
    if (running.length > 0) {
      await Promise.race([
        Promise.allSettled(running.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    el.removeAttribute("data-closing");
    el.close();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Arrow keys belong to form controls and to the tab list (which moves between tabs).
      if (target?.closest('input, select, textarea, [role="tablist"]')) return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);

  // The ARIA tabs pattern: one tab stop for the list; arrows, Home and End move
  // between tabs and select them (automatic activation).
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+Arrow is browser back/forward
    const i = TABS.findIndex((t) => t.key === tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].key);
    e.currentTarget.querySelector<HTMLElement>(`#tab-${TABS[next].key}`)?.focus();
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(e) => {
        // Esc (or the platform back gesture): route through the exit transition.
        e.preventDefault();
        void requestClose();
      }}
      onClick={(e) => e.target === dialog.current && void requestClose()}
      aria-label={shownCaption(photo.caption).text}
      className="photo-detail m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-text-primary"
    >
      <div className="flex h-full flex-col lg:flex-row">
        {/* Touch swipe steps between photos; pan-y keeps vertical scrolling and pinch-zoom native. */}
        <figure
          className="relative flex min-h-0 flex-1 touch-pan-y touch-pinch-zoom items-center justify-center p-4 lg:p-8"
          onPointerDown={(e) => {
            if (e.pointerType !== "touch" || (e.target as HTMLElement).closest("button")) return;
            swipeStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start || start.id !== e.pointerId) return;
            const delta = swipeStep(e.clientX - start.x, e.clientY - start.y);
            if (delta) onStep(delta);
          }}
          onPointerCancel={() => {
            swipeStart.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
          <img
            key={photo.id}
            src={assetUrl(photo.image)}
            alt={shownCaption(photo.caption).text}
            width={photo.width}
            height={photo.height}
            fetchPriority="high"
            className="h-auto max-h-full w-auto max-w-full rounded-md shadow-soft"
            style={{ background: photo.color, viewTransitionName: "photo-hero" }}
          />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between lg:inset-x-8">
            <span className="rounded-sm bg-base-900/80 px-2 py-1 text-caption tabular-nums text-text-secondary">
              {position.index + 1} / {position.total}
            </span>
            <div className="flex gap-1">
              <NavButton label="Previous photo" onClick={() => onStep(-1)}>
                ←
              </NavButton>
              <NavButton label="Next photo" onClick={() => onStep(1)}>
                →
              </NavButton>
              <NavButton label="Close" onClick={() => void requestClose()}>
                ✕
              </NavButton>
            </div>
          </div>
        </figure>

        <aside className="flex max-h-[55dvh] min-h-0 w-full flex-col border-t border-base-700 bg-base-800 lg:max-h-none lg:w-[440px] lg:border-l lg:border-t-0">
          <div
            role="tablist"
            aria-label="Photo details"
            onKeyDown={onTabKey}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-base-700 px-3 pt-3"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                id={`tab-${key}`}
                role="tab"
                type="button"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 whitespace-nowrap rounded-t-sm border-b-2 px-3 py-2 text-small font-medium transition-colors ${
                  tab === key
                    ? "border-accent-primary text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto p-5"
          >
            {tab === "caption" && (
              <CaptionTab
                photo={photo}
                categories={categories}
                lensVersion={lensVersion}
                terms={terms}
                applying={applying}
                onUse={onUseCaption}
              />
            )}
            {tab === "explain" && (
              <ExplainTab key={photo.id} photo={photo} categories={categories} lensVersion={lensVersion} />
            )}
            {tab === "compare" && <CompareTab photo={photo} lensVersion={lensVersion} />}
            {tab === "metadata" && <MetadataTab photo={photo} lensVersion={lensVersion} />}
          </div>
        </aside>
      </div>
    </dialog>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-sm bg-base-900/80 text-text-primary transition-colors hover:bg-base-600"
    >
      {children}
    </button>
  );
}
