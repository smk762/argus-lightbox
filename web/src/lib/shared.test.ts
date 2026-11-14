// The vendored Dragonhound shared layer (vendor/dh/). The files themselves are pinned by
// `node vendor/dh/sync-shared.mjs --check .` in CI; this pins what the app builds from them.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoStrip } from "@/components/DemoStrip";

const vendored = (path: string) => readFileSync(new URL(`../../vendor/dh/${path}`, import.meta.url), "utf8");
const squash = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<(path)([^>]*)\/>/g, "<$1$2></$1>")
    .trim();

describe("dh-strip", () => {
  it("is the vendored markup, with Lightbox marked current", () => {
    const expected = squash(vendored("dh-strip.html")).replace(
      '<a href="https://lightbox.dragonhound.dev/">',
      '<a href="https://lightbox.dragonhound.dev/" aria-current="true">',
    );
    expect(renderToStaticMarkup(createElement(DemoStrip))).toBe(expected);
  });

  it("marks exactly one site current", () => {
    const html = renderToStaticMarkup(createElement(DemoStrip, { current: "Realms" }));
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://realms.dragonhound.dev/" aria-current="true">');
  });
});
