"use client";

import { useState } from "react";

import { groupStyle } from "@/lib/categories";
import { splitTags, traceVariant } from "@/lib/explain";
import type { Photo } from "@/lib/types";

import { LensDocLink } from "../LensDocLink";
import { Chip, GroupLabel, SectionTitle } from "../ui";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative border-l border-base-600 pb-6 pl-6 last:border-l-transparent last:pb-0">
      <span className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full bg-base-600 text-caption font-semibold">
        {n}
      </span>
      <h3 className="mb-2 font-display text-small font-semibold">{title}</h3>
      {children}
    </li>
  );
}

export function ExplainTab({ photo, categories, lensVersion }: { photo: Photo; categories: string[]; lensVersion: string }) {
  const variants = Object.keys(photo.caption.caption_variants);
  const [variant, setVariant] = useState(
    variants.includes(photo.caption.selected_category) ? photo.caption.selected_category : variants[0],
  );
  const trace = traceVariant(photo, variant);
  const stripped = new Set(trace.stripped);
  const { buckets, compaction_notes, subjects, drift } = photo.explain;
  const groups = [...categories, "unclassified"];

  return (
    <div className="space-y-4">
      <p className="text-small text-text-secondary">
        The model only supplies raw output. Everything after that is lens&apos;s assembly pipeline: classify,
        filter, specialise, token-budget.{" "}
        <LensDocLink section="assembly" version={lensVersion}>
          How lens assembles a caption
        </LensDocLink>
      </p>
      {drift && (
        <p className="rounded-md border border-warning/40 bg-warn-tint p-3 text-caption text-warn-ink">
          This caption was recorded by an older lens release; the current pipeline would assemble it slightly
          differently. The recorded caption is shown.
        </p>
      )}
      <ol className="ml-3">
        <Step n={1} title={`Raw model output (${photo.caption.backend_name || "unknown backend"})`}>
          {photo.caption.raw_tags && (
            <div className="mb-3 flex flex-wrap gap-1">
              {splitTags(photo.caption.raw_tags).map((t) => (
                <Chip key={t} struck={stripped.has(t)} title={stripped.has(t) ? "Dropped before classification" : undefined}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
          {photo.caption.raw_prose && (
            <blockquote className="border-l-2 border-base-600 pl-3 text-small italic text-text-secondary">
              {photo.caption.raw_prose}
            </blockquote>
          )}
          {trace.stripped.length > 0 && (
            <p className="mt-2 text-caption text-text-muted">
              Struck-through tags never reach a category: rating/meta tags like <code>1girl</code> carry no
              training value.
            </p>
          )}
        </Step>

        <Step n={2} title="Classified into categories">
          <ul className="space-y-2">
            {groups.map((g) => {
              const tags = buckets.tags?.[g] ?? [];
              const prose = buckets.prose?.[g] ?? [];
              if (!tags.length && !prose.length) return null;
              return (
                <li key={g}>
                  <GroupLabel group={g} className="mb-1 text-caption font-medium text-text-secondary" />
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Chip key={`t-${t}`} group={g}>
                        {t}
                      </Chip>
                    ))}
                    {prose.map((p) => (
                      <Chip key={`p-${p}`} group={g} title="prose fragment">
                        “{p}”
                      </Chip>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Step>

        <Step n={3} title="Specialised into a variant">
          <label className="mb-3 flex items-center gap-2 text-caption text-text-secondary">
            Variant
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="rounded-sm border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            >
              {variants.map((v) => (
                <option key={v} value={v}>
                  {groupStyle(v).label}
                </option>
              ))}
            </select>
          </label>
          <div className="mb-3 flex flex-wrap gap-1">
            {trace.fragments.map((f) => (
              <Chip
                key={`${f.source}-${f.category}-${f.text}`}
                group={f.status === "kept" ? f.category : undefined}
                struck={f.status === "trimmed"}
                title={f.status === "kept" ? `kept (${groupStyle(f.category).label})` : "trimmed from this variant"}
              >
                {f.source === "prose" ? `“${f.text}”` : f.text}
              </Chip>
            ))}
          </div>
          <p className="rounded-md bg-base-900 p-3 text-small leading-relaxed">
            {photo.caption.caption_variants[variant]}
          </p>
        </Step>

        <Step n={4} title="What the pipeline did">
          <ul className="list-disc space-y-1 pl-5 text-small text-text-secondary">
            {compaction_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {subjects && subjects.count !== null && (
            <div className="mt-3 text-small">
              <SectionTitle>Headcount</SectionTitle>
              <p className="text-text-secondary">
                {subjects.count === 0 ? "No people" : `${subjects.count} ${subjects.count === 1 ? "person" : "people"}`}
                {subjects.agree ? ", tags and prose agree" : ", tags and prose disagree (flagged for review)"}
                {subjects.evidence.length > 0 && <> · evidence: {subjects.evidence.join(", ")}</>}
              </p>
            </div>
          )}
        </Step>
      </ol>
    </div>
  );
}
