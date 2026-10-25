"use client";

import { groupStyle } from "@/lib/categories";
import type { Photo } from "@/lib/types";

import { CopyButton, GroupLabel, Highlight, SectionTitle } from "../ui";

// Category variants first (in index order), then the specialised ones.
const SPECIAL = ["training", "training_prose", "zeroshot"];

export function CaptionTab({ photo, categories, terms }: { photo: Photo; categories: string[]; terms: string[] }) {
  const { caption } = photo;
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
        <div className="rounded-md border border-base-600 bg-base-900 p-3">
          <p className="text-body leading-relaxed">
            <Highlight text={caption.final_caption} terms={terms} />
          </p>
          <div className="mt-2 flex justify-end">
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
              <p className="mt-1 text-caption text-text-muted">{groupStyle(key).blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
