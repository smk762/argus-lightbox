"use client";

import { groupStyle } from "@/lib/categories";
import { assetUrl } from "@/lib/data";
import { type Selection, photoTerms } from "@/lib/filter";
import type { Photo } from "@/lib/types";

function matchedTerms(photo: Photo, selection: Selection): { group: string; term: string }[] {
  return Object.entries(selection).flatMap(([group, terms]) =>
    terms.filter((t) => photoTerms(photo, group).includes(t)).map((term) => ({ group, term })),
  );
}

export function PhotoGrid({
  photos,
  selection,
  onOpen,
}: {
  photos: Photo[];
  selection: Selection;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="columns-2 gap-3 sm:columns-3 2xl:columns-4">
      {photos.map((photo) => {
        const matches = matchedTerms(photo, selection);
        return (
          <li key={photo.id} className="mb-3 break-inside-avoid">
            <button
              type="button"
              onClick={() => onOpen(photo.id)}
              className="group relative block w-full overflow-hidden rounded-md shadow-soft transition-shadow duration-200 hover:shadow-glow"
              style={{ aspectRatio: `${photo.width} / ${photo.height}`, background: photo.color }}
              aria-label={photo.caption.final_caption}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static export; thumbnails are pre-sized by the bake */}
              <img
                src={assetUrl(photo.thumb)}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                width={photo.width}
                height={photo.height}
                className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              />
              {matches.length > 0 && (
                <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                  {matches.map(({ group, term }) => (
                    <span
                      key={`${group}:${term}`}
                      className="rounded-sm px-1.5 py-0.5 text-caption font-medium text-base-900"
                      style={{ background: groupStyle(group).color }}
                    >
                      {term}
                    </span>
                  ))}
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-base-900/95 via-base-900/60 to-transparent p-3 pt-10 text-left text-caption leading-snug text-text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                {photo.caption.final_caption}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
