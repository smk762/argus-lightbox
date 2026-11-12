// Runs against the committed fixture bake, so these tests also pin the
// contract between bake/ and the web app.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkIndex, IndexVersionError } from "./data";
import { traceVariant } from "./explain";
import { swipeStep } from "./gesture";
import { activeCount, facetCounts, filterPhotos, matchesQuery, toggleTerm } from "./filter";
import type { GalleryIndex, Photo } from "./types";
import { parseView, serializeView } from "./urlState";

const index = checkIndex(
  JSON.parse(readFileSync(new URL("../../public/data/index.json", import.meta.url), "utf-8")) as GalleryIndex,
);
const photos = index.photos;
const byTitle = (title: string): Photo => photos.find((p) => p.provenance.title === title)!;

describe("fixture index", () => {
  it("is a 1.x index with lens's categories", () => {
    expect(index.version.startsWith("1.")).toBe(true);
    expect(index.categories).toEqual(["identity", "wardrobe", "pose_composition", "setting", "lighting", "action"]);
    expect(photos.length).toBeGreaterThan(0);
  });

  it("rejects an incompatible major", () => {
    expect(() => checkIndex({ ...index, version: "2.0" })).toThrow(IndexVersionError);
  });
});

describe("filtering", () => {
  it("ORs terms within a group and ANDs across groups", () => {
    const either = filterPhotos(photos, "", { wardrobe: ["red dress", "leather jacket"] });
    expect(either.map((p) => p.provenance.title).sort()).toEqual(["beach sunset", "neon street"]);
    const both = filterPhotos(photos, "", { wardrobe: ["red dress", "leather jacket"], lighting: ["night"] });
    expect(both.map((p) => p.provenance.title)).toEqual(["neon street"]);
  });

  it("filters on the people and camera groups", () => {
    const groups = filterPhotos(photos, "", { people: ["group"] });
    expect(groups.map((p) => p.provenance.title).sort()).toEqual(["cafe conversation", "rooftop friends"]);
    const leica = filterPhotos(photos, "", { camera: ["LEICA Q3"] });
    expect(leica.map((p) => p.provenance.title)).toEqual(["desert road"]);
  });

  it("free-text search needs every token, across variants and raw output", () => {
    expect(matchesQuery(byTitle("beach sunset"), "red dress")).toBe(true);
    expect(matchesQuery(byTitle("beach sunset"), "red jacket")).toBe(false);
    // "waves" only appears in the raw prose, never in a tag-style variant.
    expect(matchesQuery(byTitle("beach sunset"), "waves")).toBe(true);
    expect(matchesQuery(byTitle("beach sunset"), "   ")).toBe(true);
  });

  it("counts a group under the other groups' filters, keeping selected terms", () => {
    const selection = { lighting: ["night"] };
    const wardrobe = facetCounts(photos, "wardrobe", "", selection);
    expect(wardrobe.find((t) => t.term === "leather jacket")?.count).toBe(1);
    expect(wardrobe.find((t) => t.term === "red dress")).toBeUndefined();
    // The lighting group itself ignores its own selection, so siblings stay visible.
    const lighting = facetCounts(photos, "lighting", "", selection);
    expect(lighting.find((t) => t.term === "night")?.selected).toBe(true);
    expect(lighting.length).toBeGreaterThan(1);
    // A selected term with no matches is still listed so it can be cleared.
    const stuck = facetCounts(photos, "wardrobe", "", { wardrobe: ["ball gown"] });
    expect(stuck.find((t) => t.term === "ball gown")).toEqual({ term: "ball gown", count: 0, selected: true });
  });

  it("toggles terms and drops empty groups", () => {
    let s = toggleTerm({}, "wardrobe", "jeans");
    expect(s).toEqual({ wardrobe: ["jeans"] });
    s = toggleTerm(s, "lighting", "night");
    expect(activeCount(s)).toBe(2);
    expect(toggleTerm(s, "wardrobe", "jeans")).toEqual({ lighting: ["night"] });
  });
});

describe("url state", () => {
  it("round-trips query, facets and open photo", () => {
    const view = { query: "sunset", selection: { wardrobe: ["red dress"], lighting: ["sunset", "night"] }, photo: "abc" };
    const url = serializeView(view);
    expect(parseView(new URLSearchParams(url))).toEqual(view);
  });

  it("ignores malformed facet params and keeps colons inside terms", () => {
    const view = parseView(new URLSearchParams("f=nogroup&f=:x&f=y:&f=camera:A:B"));
    expect(view.selection).toEqual({ camera: ["A:B"] });
    expect(serializeView({ query: " ", selection: {}, photo: null })).toBe("");
  });
});

describe("explain trace", () => {
  it("marks fragments kept or trimmed per variant and lists stripped meta tags", () => {
    const photo = byTitle("beach sunset");
    const setting = traceVariant(photo, "setting");
    expect(setting.fragments.find((f) => f.text === "beach")?.status).toBe("kept");
    expect(setting.stripped).toEqual(expect.arrayContaining(["1girl", "solo"]));
    // The training variant suppresses identity traits, so hair is trimmed there.
    const training = traceVariant(photo, "training");
    expect(training.fragments.find((f) => f.text === "brown hair")?.status).toBe("trimmed");
  });
});

describe("highlight", () => {
  it("marks longest terms first, case-insensitively, and ignores 1-char tokens", async () => {
    const { highlightSegments } = await import("./highlight");
    expect(highlightSegments("A Red Dress and red shoes", ["red", "red dress", "a"])).toEqual([
      { text: "A ", match: false },
      { text: "Red Dress", match: true },
      { text: " and ", match: false },
      { text: "red", match: true },
      { text: " shoes", match: false },
    ]);
    expect(highlightSegments("plain", [])).toEqual([{ text: "plain", match: false }]);
    expect(highlightSegments("a (b) c", ["(b)"])).toEqual([
      { text: "a ", match: false },
      { text: "(b)", match: true },
      { text: " c", match: false },
    ]);
  });
});

describe("swipe", () => {
  it("steps forward on a left swipe and back on a right swipe", () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });

  it("ignores short drags and mostly-vertical scrolls", () => {
    expect(swipeStep(-30, 0)).toBe(0);
    expect(swipeStep(-80, 70)).toBe(0);
  });
});
