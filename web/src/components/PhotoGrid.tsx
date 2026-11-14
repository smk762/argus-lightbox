"use client";

import { useEffect, useMemo, useRef } from "react";

import { shownCaption } from "@/lib/caption";
import { groupStyle } from "@/lib/categories";
import { assetUrl } from "@/lib/data";
import { type Selection, photoTerms } from "@/lib/filter";
import { thumbLoading } from "@/lib/thumbs";
import type { GridPhoto } from "@/lib/types";

function matchedTerms(photo: GridPhoto, selection: Selection): { group: string; term: string }[] {
  return Object.entries(selection).flatMap(([group, terms]) =>
    terms.filter((t) => photoTerms(photo, group).includes(t)).map((term) => ({ group, term })),
  );
}

export function PhotoGrid({
  photos,
  selection,
  picked,
  onOpen,
  onToggle,
  onIntent,
}: {
  photos: GridPhoto[];
  selection: Selection;
  picked: ReadonlySet<string>;
  /** `thumb` is the clicked thumbnail, for the grid -> detail view transition. */
  onOpen: (id: string, thumb: HTMLImageElement | null) => void;
  onToggle: (id: string) => void;
  /** The pointer or focus is on a thumbnail: a good moment to fetch its details. */
  onIntent?: (id: string) => void;
}) {
  const loading = useMemo(() => thumbLoading(photos), [photos]);
  const list = useRef<HTMLUListElement>(null);
  // Each thumbnail's placeholder colour. The CSP allows no inline style attributes, and the first
  // page is in the static HTML, so it is set through the CSSOM (which the CSP allows) after render.
  useEffect(() => {
    list.current?.querySelectorAll<HTMLElement>("[data-color]").forEach((el) => {
      el.style.backgroundColor = el.dataset.color ?? "";
    });
  }, [photos]);
  return (
    <ul ref={list} className="columns-2 gap-3 sm:columns-3 2xl:columns-4">
      {photos.map((photo, i) => {
        const matches = matchedTerms(photo, selection);
        const label = photo.provenance.title || "photo";
        const shown = shownCaption(photo.caption).text;
        return (
          <li key={photo.id} className="relative mb-3 break-inside-avoid">
            <input
              type="checkbox"
              checked={picked.has(photo.id)}
              onChange={() => onToggle(photo.id)}
              aria-label={`Select ${label}`}
              className="absolute right-2 top-2 z-10 size-6"
            />
            <button
              type="button"
              onClick={(e) => onOpen(photo.id, e.currentTarget.querySelector("img"))}
              onPointerEnter={() => onIntent?.(photo.id)}
              onFocus={() => onIntent?.(photo.id)}
              className="group relative block w-full overflow-hidden rounded-md bg-base-800 shadow-soft transition-shadow duration-200 hover:shadow-glow"
              data-color={photo.color}
              aria-label={shown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static export; thumbnails are pre-sized by the bake */}
              <img
                src={assetUrl(photo.thumb)}
                alt=""
                // The first screen of every column loads eagerly; the column tops are the likeliest LCP.
                loading={loading[i]?.eager ? undefined : "lazy"}
                fetchPriority={loading[i]?.high ? "high" : undefined}
                decoding={loading[i]?.eager ? undefined : "async"}
                // width/height give the box its aspect ratio before the image (or any script) loads.
                width={photo.width}
                height={photo.height}
                className="block h-auto w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
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
                {shown}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
