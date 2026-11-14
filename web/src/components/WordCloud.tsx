"use client";

import { useEffect, useMemo, useRef } from "react";

import type { ListPhoto } from "@/lib/types";
import { type WordCount, type WordField, histogramCsv, wordHistogram } from "@/lib/words";

const CLOUD_LIMIT = 60;
const COLORS = [
  "var(--color-text-primary)",
  "var(--color-accent-tertiary)",
  "var(--color-accent-secondary)",
  "var(--color-warm-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-info)",
];

function mixKey(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i++) hash = (hash * 33 + word.charCodeAt(i)) >>> 0;
  return hash;
}

function downloadHistogram(rows: WordCount[]): void {
  const blob = new Blob([histogramCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lightbox-histogram.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function WordCloud({
  photos,
  field,
  scope,
  subsetCount,
  sourceCount,
  onField,
  onScope,
  onSearch,
}: {
  photos: ListPhoto[];
  field: WordField;
  scope: "subset" | "source";
  subsetCount: number;
  sourceCount: number;
  onField: (field: WordField) => void;
  onScope: (scope: "subset" | "source") => void;
  onSearch: (word: string) => void;
}) {
  const rows = useMemo(() => wordHistogram(photos, field), [photos, field]);
  const shown = useMemo(() => rows.slice(0, CLOUD_LIMIT).sort((a, b) => mixKey(a.word) - mixKey(b.word)), [rows]);
  const peak = rows[0]?.count ?? 1;
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const sync = () => {
      const cell = document.querySelector<HTMLElement>("#gallery-grid li");
      if (!cell) {
        section.style.removeProperty("max-height");
        return;
      }
      section.style.maxHeight = `${Math.ceil(cell.getBoundingClientRect().height)}px`;
    };
    sync();
    const grid = document.getElementById("gallery-grid");
    const observer = new ResizeObserver(sync);
    if (grid) observer.observe(grid);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [photos]);

  return (
    <section
      ref={sectionRef}
      aria-label="Caption word cloud"
      className="mb-4 max-h-[calc((100cqw-0.75rem)/2)] space-y-2 overflow-y-auto sm:max-h-[calc((100cqw-1.5rem)/3)] 2xl:max-h-[calc((100cqw-2.25rem)/4)]"
    >
      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 bg-base-900 pb-1 text-caption">
        <div className="flex rounded-md border border-base-600 p-0.5" role="group" aria-label="Which photos">
          {(
            [
              ["subset", `This filter (${subsetCount})`],
              ["source", `Whole set (${sourceCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => onScope(value)}
              className={`rounded-sm px-2.5 py-1 ${scope === value ? "bg-base-600 text-text-primary" : "text-text-secondary hover:bg-base-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-base-600 p-0.5" role="group" aria-label="What to count">
          {(
            [
              ["caption", "Caption words"],
              ["tags", "Tags"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={field === value}
              onClick={() => onField(value)}
              className={`rounded-sm px-2.5 py-1 ${field === value ? "bg-base-600 text-text-primary" : "text-text-secondary hover:bg-base-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadHistogram(rows)}
          className="rounded-md border border-base-600 px-2.5 py-1 text-text-secondary hover:bg-base-700 disabled:opacity-40"
        >
          Export histogram
        </button>
        <span className="text-text-muted tabular-nums">
          {rows.length === 0 ? "No words in this set." : `${rows.length} words`}
          {rows.length > CLOUD_LIMIT ? `, showing ${CLOUD_LIMIT}` : ""}
        </span>
      </div>

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-base-700 bg-base-800 p-4">
          {shown.map((row, index) => {
            const weight = 0.85 + (row.count / peak) * 1.7;
            return (
              <button
                key={row.word}
                type="button"
                onClick={() => onSearch(row.word)}
                className="font-display leading-tight hover:underline"
                style={{ fontSize: `${weight}rem`, color: COLORS[index % COLORS.length] }}
                aria-label={`${row.word}, ${row.count}`}
                title={`${row.count}`}
              >
                {row.word}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
