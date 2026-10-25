"use client";

import { useState } from "react";

import { groupStyle } from "@/lib/categories";
import { type FacetTerm, type Selection, activeCount } from "@/lib/filter";

import { SuiteLinks } from "./SuiteLinks";

const COLLAPSED_LIMIT = 8;

function FacetGroup({
  group,
  terms,
  onToggle,
}: {
  group: string;
  terms: FacetTerm[];
  onToggle: (group: string, term: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = groupStyle(group);
  if (terms.length === 0) return null;
  const visible = expanded ? terms : terms.slice(0, COLLAPSED_LIMIT);
  return (
    <div role="group" aria-labelledby={`facet-${group}`} className="border-t border-base-700 py-4 first:border-t-0">
      <h3 id={`facet-${group}`} className="mb-2 flex items-center gap-2" title={style.blurb}>
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: style.color }} />
        <span className="font-display text-small font-semibold">{style.label}</span>
      </h3>
      <ul className="space-y-0.5">
        {visible.map(({ term, count, selected }) => (
          <li key={term}>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-small transition-colors hover:bg-base-700 ${
                count === 0 && !selected ? "opacity-40" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(group, term)}
                className="size-3.5 rounded-sm"
                style={{ accentColor: style.color }}
              />
              <span className="min-w-0 flex-1 truncate">{term}</span>
              <span className="text-caption tabular-nums text-text-muted">{count}</span>
            </label>
          </li>
        ))}
      </ul>
      {terms.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 px-1.5 text-caption text-text-secondary hover:text-text-primary"
        >
          {expanded ? "Show fewer" : `Show all ${terms.length}`}
        </button>
      )}
    </div>
  );
}

export function FacetSidebar({
  groups,
  facets,
  selection,
  onToggle,
  onClear,
}: {
  groups: string[];
  facets: Record<string, FacetTerm[]>;
  selection: Selection;
  onToggle: (group: string, term: string) => void;
  onClear: () => void;
}) {
  const active = activeCount(selection);
  return (
    <nav aria-label="Filter by caption category" className="flex flex-col">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-caption font-semibold uppercase tracking-wider text-text-muted">
          Filter by caption
        </h2>
        {active > 0 && (
          <button type="button" onClick={onClear} className="text-caption text-accent-tertiary hover:underline">
            Clear {active}
          </button>
        )}
      </div>
      <p className="mb-1 text-caption text-text-muted">
        Facets come from lens&apos;s category buckets, not keyword matching.
      </p>
      {groups.map((group) => (
        <FacetGroup key={group} group={group} terms={facets[group] ?? []} onToggle={onToggle} />
      ))}
      <SuiteLinks />
    </nav>
  );
}
