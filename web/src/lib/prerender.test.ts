// The build-time half of the gallery: the split list/detail files, the page baked into the HTML,
// thumbnail loading hints, link targets, and the facet colours the prerendered sidebar uses.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { localDataDir, prerenderEnabled, splitIndex } from "../../scripts/split-index.mjs";

import { STYLES } from "./categories";
import { shownCaption } from "./caption";
import { EXTRA_GROUPS, facetCounts } from "./filter";
import { isFamilyUrl } from "./links";
import { buildTimeIndex, gridCard, prerenderGallery } from "./prerender";
import { thumbLoading } from "./thumbs";
import type { GalleryIndex } from "./types";

const fixture = JSON.parse(
  readFileSync(new URL("../../public/data/index.json", import.meta.url), "utf-8"),
) as GalleryIndex;

describe("split-index", () => {
  it("is off unless LIGHTBOX_PRERENDER=1", () => {
    expect(prerenderEnabled({})).toBe(false);
    expect(prerenderEnabled({ LIGHTBOX_PRERENDER: "1" })).toBe(true);
  });

  it("finds the data directory in the build, or none for a remote URL", () => {
    expect(localDataDir({})).toBe("data");
    expect(localDataDir({ NEXT_PUBLIC_DATA_URL: "/data-tape" })).toBe("data-tape");
    expect(localDataDir({ NEXT_PUBLIC_DATA_URL: "/demo/data-tape/", NEXT_PUBLIC_BASE_PATH: "/demo" })).toBe("data-tape");
    expect(localDataDir({ NEXT_PUBLIC_DATA_URL: "https://cdn.example/data" })).toBeNull();
  });

  it("moves explain and compare out of the list, and loses nothing", () => {
    const { list, details } = splitIndex(fixture as never) as {
      list: GalleryIndex;
      details: [string, Record<string, unknown>][];
    };
    expect(list.lens_version).toBe(fixture.lens_version);
    expect(list.photos).toHaveLength(fixture.photos.length);
    for (const photo of list.photos) {
      expect(photo).not.toHaveProperty("explain");
      expect(photo).not.toHaveProperty("compare");
    }
    const byId = new Map(details);
    expect(list.photos.map((p) => ({ ...p, ...byId.get(p.id) }))).toEqual(fixture.photos);
    expect(fixture.photos[0]).toHaveProperty("explain"); // the input is untouched
  });

  it("refuses a photo id that isn't a safe file name", () => {
    const bad = { ...fixture, photos: [{ ...fixture.photos[0], id: "../x" }] };
    expect(() => splitIndex(bad as never)).toThrow(/safe file name/);
  });
});

describe("prerender", () => {
  it("reads nothing unless the build asks for it", () => {
    expect(buildTimeIndex({})).toBeNull();
    expect(buildTimeIndex({ LIGHTBOX_PRERENDER: "1", NEXT_PUBLIC_DATA_URL: "https://cdn.example/data" })).toBeNull();
    expect(buildTimeIndex({ LIGHTBOX_PRERENDER: "1" })?.photos).toHaveLength(fixture.photos.length);
  });

  it("bakes the first page as small cards with the caption the grid shows", () => {
    const page = prerenderGallery(fixture, 5);
    expect(page.total).toBe(fixture.photos.length);
    expect(page.firstPage.map((c) => c.id)).toEqual(fixture.photos.slice(0, 5).map((p) => p.id));
    const card = gridCard(fixture.photos[0]);
    expect(Object.keys(card).sort()).toEqual(
      ["caption", "color", "exif", "facets", "height", "id", "provenance", "thumb", "width"].sort(),
    );
    expect(shownCaption(card.caption).text).toBe(shownCaption(fixture.photos[0].caption).text);
    expect(page.meta).not.toHaveProperty("photos");
  });

  it("bakes the unfiltered facet counts for every group", () => {
    const page = prerenderGallery(fixture, 48);
    expect(Object.keys(page.facets)).toEqual([...fixture.categories, ...EXTRA_GROUPS]);
    expect(page.facets.setting).toEqual(facetCounts(fixture.photos, "setting", "", {}));
  });
});

describe("thumbLoading", () => {
  const square = { width: 100, height: 100 };

  it("loads the top of every column eagerly, and the first screen of each", () => {
    const hints = thumbLoading(Array.from({ length: 48 }, () => square));
    expect(hints[0]).toEqual({ eager: true, high: true });
    // Two balanced columns of 24 squares: column two starts at item 24.
    expect(hints[24]).toEqual({ eager: true, high: true });
    expect(hints.filter((h) => h.high)).toHaveLength(2);
    expect(hints[23].eager).toBe(false);
    expect(hints[47].eager).toBe(false);
  });

  it("copes with an empty page and missing sizes", () => {
    expect(thumbLoading([])).toEqual([]);
    expect(thumbLoading([{ width: 0, height: 0 }])[0].eager).toBe(true);
  });
});

describe("isFamilyUrl", () => {
  it("keeps the Dragonhound demos in the same tab", () => {
    expect(isFamilyUrl("https://dragonhound.dev")).toBe(true);
    expect(isFamilyUrl("https://studio.dragonhound.dev/curate/")).toBe(true);
    expect(isFamilyUrl("https://REALMS.dragonhound.dev/")).toBe(true);
  });

  it("treats everything else as external", () => {
    expect(isFamilyUrl("https://github.com/smk762/argus-lens")).toBe(false);
    expect(isFamilyUrl("https://notdragonhound.dev/")).toBe(false);
    expect(isFamilyUrl("https://dragonhound.dev.example.com/")).toBe(false);
    expect(isFamilyUrl("/docs/")).toBe(false);
    expect(isFamilyUrl(undefined)).toBe(false);
  });
});

describe("facet group colours", () => {
  it("globals.css gives every group the colour categories.ts does", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf-8");
    for (const [key, style] of Object.entries(STYLES)) {
      expect(css, key).toContain(`[data-group="${key}"] { --group: ${style.color}; }`);
    }
  });
});
