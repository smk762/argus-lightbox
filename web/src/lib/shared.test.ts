// The vendored Dragonhound shared layer (vendor/dh/). The files themselves are pinned by
// `node vendor/dh/sync-shared.mjs --check .` in CI; this pins what the app builds from them.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoStrip } from "@/components/DemoStrip";

import { stripHtml } from "../../vendor/dh/dh-strip.mjs";

const vendored = (path: string) => readFileSync(new URL(`../../vendor/dh/${path}`, import.meta.url), "utf8");
const squash = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<(path)([^>]*)\/>/g, "<$1$2></$1>")
    .trim();
// The JSX strip also carries data-dh-site on the <nav> (dh-strip.css marks the current link from it).
const rendered = (current?: "lightbox" | "studio" | "realms") =>
  renderToStaticMarkup(createElement(DemoStrip, current ? { current } : {})).replace(
    /<nav ([^>]*) data-dh-site="[a-z]+">/,
    "<nav $1>",
  );

describe("dh-strip", () => {
  it("renders the shared source's markup, with Lightbox marked current", () => {
    expect(rendered()).toBe(squash(stripHtml({ current: "lightbox" })));
  });

  it("matches the vendored static strip apart from the current marker", () => {
    expect(rendered().replace(' aria-current="page"', "")).toBe(squash(vendored("dh-strip.html")));
  });

  it("marks exactly one site current, on the nav and the link", () => {
    const html = renderToStaticMarkup(createElement(DemoStrip, { current: "realms" }));
    expect(html).toContain('<nav class="dh-strip" aria-label="Dragonhound Labs demos" data-dh-site="realms">');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://realms.dragonhound.dev/" data-dh-site="realms" aria-current="page">');
  });
});
