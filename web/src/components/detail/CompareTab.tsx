"use client";

import { useState } from "react";

import { groupStyle } from "@/lib/categories";
import type { Photo } from "@/lib/types";

const MODES = [
  { key: "tags", label: "Tags only", blurb: "WD14-style tagger output alone" },
  { key: "prose", label: "Prose only", blurb: "Florence-style description alone" },
  { key: "hybrid", label: "Hybrid", blurb: "Both, fused by lens" },
] as const;

export function CompareTab({ photo }: { photo: Photo }) {
  const [variant, setVariant] = useState("final");
  const hybrid = photo.compare.hybrid;

  if (!hybrid) {
    return (
      <p className="text-small text-text-secondary">
        This photo was captioned by a single backend (<code>{photo.caption.backend_name}</code>), so there is
        nothing to compare. Photos captioned by the hybrid tag + prose backend show how lens assembles the same raw
        output three ways.
      </p>
    );
  }

  const variants = ["final", ...Object.keys(hybrid.caption_variants)];
  return (
    <div className="space-y-4">
      <p className="text-small text-text-secondary">
        Same image, same raw model output, assembled from the tags alone, the prose alone, and both. No model is
        re-run: this is the assembly pipeline doing the work.
      </p>
      <label className="flex items-center gap-2 text-caption text-text-secondary">
        Show
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          className="rounded-sm border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
        >
          {variants.map((v) => (
            <option key={v} value={v}>
              {v === "final" ? "Final caption" : groupStyle(v).label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3">
        {MODES.map(({ key, label, blurb }) => {
          const composed = photo.compare[key];
          const text = composed ? (variant === "final" ? composed.final_caption : composed.caption_variants[variant]) : "";
          return (
            <section
              key={key}
              className={`rounded-md border p-3 ${key === "hybrid" ? "border-accent-primary/60 bg-accent-primary/5" : "border-base-600"}`}
            >
              <h3 className="font-display text-small font-semibold">{label}</h3>
              <p className="mb-2 text-caption text-text-muted">{blurb}</p>
              <p className="text-small leading-relaxed">{text || <span className="text-text-muted">(empty)</span>}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
