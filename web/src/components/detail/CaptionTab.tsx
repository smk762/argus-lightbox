"use client";

import { groupStyle } from "@/lib/categories";
import { tokenUse } from "@/lib/tokens";
import type { Photo } from "@/lib/types";

import { CopyButton, GroupLabel, Highlight, SectionTitle } from "../ui";

function TokenCount({ text, backend, alert = false }: { text: string; backend?: string; alert?: boolean }) {
  const { used, budget, over } = tokenUse(text, backend);
  const name = (backend || "sdxl").toLowerCase();
  const label = over ? `${used} / ${budget} tokens, over the ${name} budget` : `${used} / ${budget} tokens`;
  return (
    <p className={`text-caption tabular-nums ${over ? "text-warning" : "text-text-muted"}`} role={alert && over ? "alert" : undefined}>
      {label}
    </p>
  );
}

// Category variants first (in index order), then the specialised ones.
const SPECIAL = ["training", "training_prose", "zeroshot"];

export function CaptionTab({ photo, categories, terms }: { photo: Photo; categories: string[]; terms: string[] }) {
  const { caption } = photo;
  const backend = typeof caption.profile?.target_backend === "string" ? caption.profile.target_backend : undefined;
  const finalUse = tokenUse(caption.final_caption, backend);
  const keys = [
    ...categories.filter((c) => c in caption.caption_variants),
    ...SPECIAL.filter((c) => c in caption.caption_variants),
    ...Object.keys(caption.caption_variants).filter((c) => !categories.includes(c) && !SPECIAL.includes(c)),
  ];
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle hint={`selected variant: ${groupStyle(caption.selected_category).label}`}>
          Final caption
        </SectionTitle>
        <div className={`rounded-md border bg-base-900 p-3 ${finalUse.over ? "border-warning" : "border-base-600"}`}>
          <p className="text-body leading-relaxed">
            <Highlight text={caption.final_caption} terms={terms} />
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <TokenCount text={caption.final_caption} backend={backend} alert />
            <CopyButton text={caption.final_caption} />
          </div>
        </div>
        <p className="mt-2 text-caption text-text-muted">
          This is what lens writes to <code>{"<image>.txt"}</code> next to the source image.
        </p>
      </section>

      <section>
        <SectionTitle hint="one per category, plus training & zero-shot">Variants</SectionTitle>
        <ul className="space-y-2">
          {keys.map((key) => (
            <li key={key} className="rounded-md bg-base-900/60 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <GroupLabel group={key} className="text-caption font-medium text-text-secondary" />
                <CopyButton text={caption.caption_variants[key]} />
              </div>
              <p className="text-small leading-relaxed">
                <Highlight text={caption.caption_variants[key]} terms={terms} />
              </p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-caption text-text-muted">{groupStyle(key).blurb}</p>
                <TokenCount text={caption.caption_variants[key]} backend={backend} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
