"use client";

import { useState } from "react";

import { groupStyle } from "@/lib/categories";
import { highlightSegments } from "@/lib/highlight";

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((seg, i) => (seg.match ? <mark key={i}>{seg.text}</mark> : seg.text))}
    </>
  );
}

/** A small category-coloured dot + label, used wherever a lens category is named. */
export function GroupLabel({ group, className = "" }: { group: string; className?: string }) {
  const style = groupStyle(group);
  return (
    <span data-group={group} className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--group)" />
      {style.label}
    </span>
  );
}

/** A tag chip; with a `group`, in that group's categorical tint (ink text on the tint, fill border). */
export function Chip({
  children,
  group,
  struck = false,
  title,
}: {
  children: React.ReactNode;
  group?: string;
  struck?: boolean;
  title?: string;
}) {
  const coloured = group !== undefined && !struck;
  return (
    <span
      title={title}
      data-group={coloured ? group : undefined}
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-caption ${
        coloured
          ? "border-(--group) bg-(--group-tint) text-(--group-ink)"
          : `border-base-600 ${struck ? "text-text-muted line-through" : "text-text-primary"}`
      }`}
    >
      {children}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard can be unavailable (insecure origin, permissions); the text stays selectable.
        }
      }}
      className="shrink-0 rounded-sm px-2 py-0.5 text-caption text-text-secondary transition-colors hover:bg-base-600 hover:text-text-primary"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="font-display text-small font-semibold text-text-primary">{children}</h3>
      {hint && <span className="text-caption text-text-muted">{hint}</span>}
    </div>
  );
}
