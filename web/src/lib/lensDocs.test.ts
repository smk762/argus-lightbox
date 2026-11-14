// The lens doc links and the "Captioned by" line, checked against both committed bakes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkIndex } from "./data";
import { captionSettings, captionedBy, lensDocUrl, lensPypiUrl, lensSource, lensTreeUrl, refineSummary } from "./lensDocs";
import type { GalleryIndex } from "./types";

const load = (dir: string) =>
  checkIndex(JSON.parse(readFileSync(new URL(`../../public/${dir}/index.json`, import.meta.url), "utf-8")) as GalleryIndex);

describe("lensSource", () => {
  it("links a release to its tag and PyPI page", () => {
    expect(lensSource("0.10.0")).toEqual({ version: "0.10.0", ref: "v0.10.0", sha: null, release: true });
    expect(lensPypiUrl("0.10.0")).toBe("https://pypi.org/project/argus-lens/0.10.0/");
    expect(lensTreeUrl("0.10.0")).toBe("https://github.com/smk762/argus-lens/tree/v0.10.0");
  });

  it("links a dev build to its commit, and not to a PyPI release", () => {
    const src = lensSource("0.10.1.dev11+gcfb16b3f1");
    expect(src).toMatchObject({ ref: "cfb16b3f1", sha: "cfb16b3", release: false });
    expect(lensSource("0.10.1.dev11+gcfb16b3.d20261113").ref).toBe("cfb16b3");
    expect(lensPypiUrl("0.10.1.dev11+gcfb16b3")).toBe("https://pypi.org/project/argus-lens/");
  });

  it("falls back to dev when the version says nothing usable", () => {
    expect(lensSource("").ref).toBe("dev");
    expect(lensSource(undefined).ref).toBe("dev");
    expect(lensSource("0.10.1.dev3").ref).toBe("dev");
    // A local build label (the tape's lens 0.10.0 plus PRs) names no commit, so it is not linked as 0.10.0.
    expect(lensSource("0.10.0+pr90.94")).toEqual({ version: "0.10.0+pr90.94", ref: "dev", sha: null, release: false });
  });

  it("builds README section links", () => {
    expect(lensDocUrl("refine", "0.10.0")).toBe(
      "https://github.com/smk762/argus-lens/blob/v0.10.0/README.md#refinement-llm-rewrite-validated",
    );
    expect(lensDocUrl("overview", "0.10.0")).toBe("https://github.com/smk762/argus-lens/blob/v0.10.0/README.md");
  });
});

describe("captioned by, from recorded data", () => {
  it("fixture: lens version and backend, no refine", () => {
    const index = load("data");
    const by = captionedBy(index.photos[0].caption, index.lens_version);
    expect(by).toMatchObject({ lensVersion: "0.7.0", backend: "hybrid", refineModel: null });
    expect(refineSummary(by)).toBeNull();
    expect(lensSource(index.lens_version).release).toBe(true);
  });

  it("tape: the refine model lens recorded", () => {
    const index = load("data-tape");
    const by = captionedBy(index.photos[0].caption, index.lens_version);
    expect(by).toMatchObject({ lensVersion: index.lens_version, backend: "hybrid", refineModel: "qwen3:4b-instruct" });
    expect(refineSummary(by)).toBe("refined by qwen3:4b-instruct");
  });

  it("says when a rewrite was rejected or skipped", () => {
    const base = { final_caption: "", caption_variants: {}, selected_category: "identity", raw_tags: "", raw_prose: "" };
    expect(refineSummary(captionedBy({ ...base, backend_name: "x", refine: { model: "m" } }, "1.0.0"))).toBe(
      "m's rewrite was not kept",
    );
    expect(refineSummary(captionedBy({ ...base, backend_name: "x", refine: { skipped: "no server" } }, "1.0.0"))).toBe(
      "LLM rewrite skipped (no server)",
    );
  });
});

describe("captionSettings", () => {
  it("names a preset and lens's default when they differ", () => {
    expect(
      captionSettings({
        tag_model: "RAM++",
        prose_model: "qwen3-vl:2b-instruct",
        prose_prompt: "straightforward",
        prose_prompt_default: "detailed",
        refine_model: "qwen3:4b-instruct",
      }),
    ).toBe(
      `Tags by RAM++. Prose by qwen3-vl:2b-instruct with lens's "straightforward" prompt preset (lens's default is "detailed"). Checked rewrite by qwen3:4b-instruct.`,
    );
  });

  it("calls literal prompt text custom, and says nothing without params", () => {
    expect(captionSettings({ prose_prompt: "Describe the photo plainly." })).toBe(
      "Prose by the prose model with a custom prompt.",
    );
    expect(captionSettings(undefined)).toBeNull();
    expect(captionSettings({})).toBeNull();
  });

  it("reads the tape's recorded settings", () => {
    const tape = load("data-tape");
    expect(captionSettings(tape.caption_params)).toContain(`"${tape.caption_params?.prose_prompt}" prompt preset`);
  });
});
