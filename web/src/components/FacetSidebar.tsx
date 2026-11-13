"use client";

import { useState } from "react";

import { groupStyle } from "@/lib/categories";
import { browserStorage, defaultOpen, readOpenState, writeOpenState } from "@/lib/facetGroups";
import { type FacetTerm, type Selection, activeCount } from "@/lib/filter";

import { SuiteLinks } from "./SuiteLinks";

const COLLAPSED_LIMIT = 8;

function FacetGroup({
  group,
  terms,
  active,
  onToggle,
}: {
  group: string;
  terms: FacetTerm[];
  active: number;
  onToggle: (group: string, term: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // The viewer's remembered choice; undefined means "use the default for this group's length".
  const [remembered, setRemembered] = useState<boolean | undefined>(() => readOpenState(browserStorage())[group]);
  const style = groupStyle(group);
  if (terms.length === 0) return null;
  const open = remembered ?? defaultOpen(group, terms.length);
  const visible = expanded ? terms : terms.slice(0, COLLAPSED_LIMIT);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === open) return; // React re-applying `open`, not the viewer
        setRemembered(next);
        writeOpenState(browserStorage(), group, next);
      }}
      className="group/facet border-t border-base-700 py-3 first:border-t-0"
    >
      <summary
        title={style.blurb}
        className="flex cursor-pointer list-none items-center gap-2 rounded-sm px-1 py-1 hover:bg-base-700 [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden
          className="inline-block w-3 text-caption text-text-muted transition-transform group-open/facet:rotate-90"
        >
          ▸
        </span>
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: style.color }} />
        <h3 className="font-display text-small font-semibold">{style.label}</h3>
        {!open && active > 0 && (
          <span className="ml-auto rounded-full bg-base-700 px-1.5 text-caption tabular-nums text-text-primary">
            {active}
            <span className="sr-only"> active {active === 1 ? "filter" : "filters"}</span>
          </span>
        )}
      </summary>
      <ul className="mt-1 space-y-0.5">
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
    </details>
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
        Category hints claim a tag when they can. Other ordinary tags are listed below.
      </p>
      {groups.map((group) => (
        <FacetGroup
          key={group}
          group={group}
          terms={facets[group] ?? []}
          active={selection[group]?.length ?? 0}
          onToggle={onToggle}
        />
      ))}
      <SuiteLinks />
    </nav>
  );
}
