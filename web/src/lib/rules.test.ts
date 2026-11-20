// Must-nevers from CLAUDE.md that are about code shape: colours come from tokens, no text is smaller than
// 12 px, and the explain view never reads CaptionResult.removed_phrases.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ path: path.slice(SRC.length), text: readFileSync(path, "utf-8") }));
const code = files.filter((f) => !f.path.endsWith(".css"));
const css = files.filter((f) => f.path.endsWith(".css"));
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

describe("token classes only", () => {
  it("has sources to check", () => {
    expect(code.length).toBeGreaterThan(10);
    expect(css.map((f) => f.path)).toContain("app/globals.css");
  });

  it("uses no raw colours in components or lib code", () => {
    // A quoted or bracketed hex (`"#336699"`, `bg-[#336699]`), or a colour function.
    const raw = /["'`[(]#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/;
    expect(code.filter((f) => raw.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("sets no arbitrary text size, and no Tailwind size below the 12 px caption", () => {
    const small = /\btext-\[\d|\btext-(?:2xs|3xs)\b/;
    expect(code.filter((f) => small.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("keeps raw hex in CSS to the --dh-accent / --dh-on-accent override", () => {
    const stray = css.flatMap((f) =>
      stripComments(f.text)
        .split("\n")
        .filter((line) => /#[0-9a-fA-F]{3,8}\b/.test(line) && !/^\s*--dh-(?:on-)?accent:/.test(line))
        .map((line) => `${f.path}: ${line.trim()}`),
    );
    expect(stray).toEqual([]);
  });

  it("declares no font size below 12 px in CSS", () => {
    const sizes = css.flatMap((f) =>
      [...stripComments(f.text).matchAll(/(?:--text-[a-z0-9-]+|font-size)\s*:\s*([\d.]+)(px|rem)\b/g)].map((m) => ({
        where: `${f.path}: ${m[0]}`,
        px: Number(m[1]) * (m[2] === "rem" ? 16 : 1),
      })),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((s) => s.px < 12).map((s) => s.where)).toEqual([]);
  });
});

describe("explain view", () => {
  it("never reads CaptionResult.removed_phrases, which over-reports for a single variant", () => {
    const uncommented = (text: string) => stripComments(text).replace(/^\s*\/\/.*$/gm, "");
    expect(code.filter((f) => /\bremoved_phrases\b/.test(uncommented(f.text))).map((f) => f.path)).toEqual([]);
  });
});
