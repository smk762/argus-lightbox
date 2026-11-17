// Runs against the committed fixture bake, so these tests also pin the
// contract between bake/ and the web app.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkIndex, IndexVersionError } from "./data";
import { containsPhrase, traceVariant } from "./explain";
import { swipeStep } from "./gesture";
import { safeHref } from "./links";
import { activeCount, facetCounts, filterPhotos, matchesQuery, toggleTerm } from "./filter";
import type { GalleryIndex, Photo } from "./types";
import { parseView, serializeView } from "./urlState";
import { estimateTokens, tokenBudget } from "./tokens";
import { histogramCsv, wordHistogram } from "./words";

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
    const view = {
      query: "sunset",
      selection: { wardrobe: ["red dress"], lighting: ["sunset", "night"] },
      photo: "abc",
      cloud: false,
      words: "caption" as const,
      scope: "subset" as const,
    };
    const url = serializeView(view);
    expect(parseView(new URLSearchParams(url))).toEqual(view);
  });

  it("round-trips the word cloud, and omits it when the grid is showing", () => {
    const view = {
      query: "",
      selection: {},
      photo: null,
      cloud: true,
      words: "tags" as const,
      scope: "source" as const,
    };
    const url = serializeView(view);
    expect(url).toBe("?cloud=1&words=tags&scope=source");
    expect(parseView(new URLSearchParams(url))).toEqual(view);
    expect(serializeView({ ...view, cloud: false, words: "caption", scope: "subset" })).toBe("");
  });

  it("ignores malformed facet params and keeps colons inside terms", () => {
    const view = parseView(new URLSearchParams("f=nogroup&f=:x&f=y:&f=camera:A:B"));
    expect(view.selection).toEqual({ camera: ["A:B"] });
    expect(serializeView({ query: " ", selection: {}, photo: null, cloud: false, words: "caption", scope: "subset" })).toBe(
      "",
    );
  });

  it("treats Object.prototype names in a shared link as ordinary groups", () => {
    const url = "f=__proto__:x&f=constructor:y&f=toString:z&f=toString:z";
    const view = parseView(new URLSearchParams(url));
    expect(Object.keys(view.selection).sort()).toEqual(["__proto__", "constructor", "toString"]);
    expect(view.selection.toString).toEqual(["z"]);
    expect(Object.getPrototypeOf(view.selection)).toBe(Object.prototype);
    expect(serializeView(view)).toBe(`?${new URLSearchParams("f=__proto__:x&f=constructor:y&f=toString:z")}`);
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

  it("matches fragments as whole words, not substrings", () => {
    expect(containsPhrase("a woman in a red hat", "hat")).toBe(true);
    expect(containsPhrase("that is all", "hat")).toBe(false);
    expect(containsPhrase("a quiet street", "tree")).toBe(false);
    expect(containsPhrase("one hundred birds", "red")).toBe(false);
    expect(containsPhrase("she smiles", "smile")).toBe(false);
    expect(containsPhrase("a (soft) light", "(soft)")).toBe(true);
    const photo = byTitle("beach sunset");
    const tricky: Photo = {
      ...photo,
      caption: { ...photo.caption, caption_variants: { ...photo.caption.caption_variants, setting: "a street" } },
      explain: { ...photo.explain, buckets: { tags: { setting: ["tree"] }, prose: {} } },
    };
    expect(traceVariant(tricky, "setting").fragments[0].status).toBe("trimmed");
  });
});

describe("word cloud", () => {
  it("counts caption words, keeps tag phrases, and exports a histogram", () => {
    const sunset = byTitle("beach sunset");
    const words = wordHistogram(
      [{ ...sunset, caption: { ...sunset.caption, final_caption: "the dress and the ocean" } }],
      "caption",
    );
    expect(words.map((row) => row.word)).toEqual(["dress", "ocean"]);
    const tags = wordHistogram([sunset], "tags");
    expect(tags.find((row) => row.word === "red dress")?.count).toBe(1);
    expect(tags.find((row) => row.word === "looking at viewer")?.count).toBe(1);
    const csv = histogramCsv([
      { word: "red dress", count: 3 },
      { word: "a, b", count: 1 },
    ]);
    expect(csv).toBe('word,count,share\nred dress,3,0.7500\n"a, b",1,0.2500\n');
  });
});

describe("token budget", () => {
  it("matches lens's CLIP and T5 estimates, and the backend budgets", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("red dress")).toBe(2);
    expect(estimateTokens("a, b_c d")).toBe(5);
    expect(estimateTokens("a, b", "flux")).toBe(3);
    expect(tokenBudget("sdxl")).toBe(60);
    expect(tokenBudget("flux")).toBe(200);
    expect(tokenBudget(undefined)).toBe(60);
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect(tokenBudget(name)).toBe(60);
    const prose =
      "A wooden stool with a ladder-back design, made of light-brown, grain-textured planks, rests on a tiled floor beside a dark green mat. The stool's legs and horizontal supports are bolted together, casting a sharp shadow on the white tiles.";
    expect(estimateTokens(prose, "sdxl")).toBe(54);
    expect(estimateTokens(`${"word ".repeat(50).trim()}`, "sdxl")).toBe(65);
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

describe("provenance links", () => {
  it("only lets http(s) URLs through", () => {
    expect(safeHref("https://commons.wikimedia.org/x")).toBe("https://commons.wikimedia.org/x");
    expect(safeHref("http://example.com/")).toBe("http://example.com/");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(" JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHref("/relative")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
