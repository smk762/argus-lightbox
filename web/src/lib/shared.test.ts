// The vendored Dragonhound shared layer (vendor/dh/). The files themselves are pinned by
// `node vendor/dh/sync-shared.mjs --check .` in CI; this pins what the app builds from them.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoStrip } from "@/components/DemoStrip";

import { strip, stripHtml } from "../../vendor/dh/dh-strip.mjs";

const vendored = (path: string) => readFileSync(new URL(`../../vendor/dh/${path}`, import.meta.url), "utf8");
const squash = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<(path)([^>]*)\/>/g, "<$1$2></$1>")
    .trim();
// dh-shared 1.2.4: the static strip carries every label suffix (data-dh-label picks one); the JSX renders the default only.
const defaultSuffixOnly = (html: string) =>
  html
    .replace(/<span class="dh-strip-more" data-dh-label="[a-z]+" hidden>[^<]*<\/span>/g, "")
    .replace(/<span class="dh-strip-more" data-dh-label="[a-z]+">/, '<span class="dh-strip-more">');
// The JSX strip also carries data-dh-site on the <nav> (dh-strip.css marks the current link from it).
const rendered = (current?: "lightbox" | "studio" | "atlas" | "realms" | "safelight" | "assay" | "sightline" | "mask" | "quarry") =>
  renderToStaticMarkup(createElement(DemoStrip, current ? { current } : {})).replace(
    /<nav ([^>]*) data-dh-site="[a-z]+">/,
    "<nav $1>",
  );

describe("dh-strip", () => {
  it("renders the shared source's markup, with Lightbox marked current", () => {
    expect(rendered()).toBe(squash(stripHtml({ current: "lightbox", label: strip.defaultLabel })));
  });

  it("matches the vendored static strip apart from the current marker", () => {
    expect(rendered().replace(' aria-current="page"', "")).toBe(defaultSuffixOnly(squash(vendored("dh-strip.html"))));
  });

  it("marks exactly one site current, on the nav and the link", () => {
    const html = renderToStaticMarkup(createElement(DemoStrip, { current: "atlas" }));
    expect(html).toContain('<nav class="dh-strip" aria-label="Dragonhound Labs demos" data-dh-site="atlas">');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://atlas.dragonhound.dev/" data-dh-site="atlas" aria-current="page">');
  });
});
