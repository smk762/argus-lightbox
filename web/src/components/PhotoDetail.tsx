"use client";

import { useEffect, useRef, useState } from "react";

import { assetUrl } from "@/lib/data";
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
  terms,
  applying,
  onClose,
  onStep,
  onUseCaption,
}: {
  photo: Photo;
  position: { index: number; total: number };
  categories: string[];
  terms: string[];
  applying: boolean;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  onUseCaption: (category: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("caption");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label={photo.caption.final_caption}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-text-primary"
    >
      <div className="flex h-full flex-col lg:flex-row">
        <figure className="relative flex min-h-0 flex-1 items-center justify-center p-4 lg:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
          <img
            key={photo.id}
            src={assetUrl(photo.image)}
            alt={photo.caption.final_caption}
            width={photo.width}
            height={photo.height}
            className="h-auto max-h-full w-auto max-w-full rounded-md shadow-soft"
            style={{ background: photo.color }}
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
              <NavButton label="Close" onClick={() => dialog.current?.close()}>
                ✕
              </NavButton>
            </div>
          </div>
        </figure>

        <aside className="flex max-h-[55dvh] min-h-0 w-full flex-col border-t border-base-700 bg-base-800 lg:max-h-none lg:w-[440px] lg:border-l lg:border-t-0">
          <div role="tablist" aria-label="Photo details" className="flex shrink-0 gap-1 overflow-x-auto border-b border-base-700 px-3 pt-3">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
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
          <div role="tabpanel" id={`panel-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "caption" && (
              <CaptionTab photo={photo} categories={categories} terms={terms} applying={applying} onUse={onUseCaption} />
            )}
            {tab === "explain" && <ExplainTab key={photo.id} photo={photo} categories={categories} />}
            {tab === "compare" && <CompareTab photo={photo} />}
            {tab === "metadata" && <MetadataTab photo={photo} />}
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
