import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_CAPTION, FALLBACK_CAPTION, shownCaption } from "./caption";
import type { GalleryIndex } from "./types";

const caption = {
  final_caption: "moon, night sky",
  caption_variants: { identity: "moon, night sky", zeroshot: "a full moon over dark branches, moon, night sky", setting: "  " },
};

describe("shown caption", () => {
  it("defaults to the zero-shot variant", () => {
    expect(FALLBACK_CAPTION).toBe("zeroshot");
    expect(DEFAULT_CAPTION).toBe(process.env.NEXT_PUBLIC_DEFAULT_CAPTION || "zeroshot");
    expect(shownCaption(caption, "zeroshot")).toEqual({
      text: "a full moon over dark branches, moon, night sky",
      variant: "zeroshot",
      fellBack: false,
    });
  });

  it("honours another configured variant, or lens's own pick", () => {
    expect(shownCaption(caption, "identity").variant).toBe("identity");
    expect(shownCaption(caption, "final")).toEqual({ text: "moon, night sky", variant: "final", fellBack: false });
  });

  it("falls back to the final caption when the variant is missing or blank", () => {
    expect(shownCaption(caption, "wardrobe")).toEqual({ text: "moon, night sky", variant: "final", fellBack: true });
    expect(shownCaption(caption, "setting").fellBack).toBe(true);
    expect(shownCaption({ final_caption: "x", caption_variants: {} }, "zeroshot").text).toBe("x");
  });

  it("treats an empty setting as the fallback variant", () => {
    expect(shownCaption(caption, " ").variant).toBe("zeroshot");
  });

  it("finds a zero-shot caption for every photo in the hosted tape", () => {
    const tape = JSON.parse(
      readFileSync(new URL("../../public/data-tape/index.json", import.meta.url), "utf-8"),
    ) as GalleryIndex;
    expect(tape.photos.every((p) => !shownCaption(p.caption, "zeroshot").fellBack)).toBe(true);
  });
});
