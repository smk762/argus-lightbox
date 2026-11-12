// Post-build: give every exported page a strict, hash-based Content-Security-Policy.
//
// `next build` (output: "export") emits Next's bootstrap as inline <script>s and
// there is no server to mint nonces, so each page gets a <meta http-equiv> CSP
// listing the sha256 of exactly the inline scripts it shipped with. Hashing at
// build time is safe here because the HTML contains no user content: captions
// and every other piece of data arrive later from index.json and render through
// React. Directives a <meta> CSP can't carry (frame-ancestors) go in out/_headers,
// which Cloudflare Pages and Netlify read; other hosts should send the same.
//
//   node scripts/csp.mjs [outDir]   (run by `npm run build`)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** @param {string} html @returns {string[]} CSP hash sources for each non-empty inline script. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, body] of html.matchAll(INLINE_SCRIPT)) {
    if (body) hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/** @param {string | undefined} url @returns {string} The origin to allow for the baked data, or "" for same-origin. */
export function dataOrigin(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  return new URL(url).origin;
}

/** @param {string[]} hashes @param {string} data extra origin for index.json and renditions ("" = same origin) */
export function policy(hashes, data = "") {
  const self = data ? `'self' ${data}` : "'self'";
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    "style-src 'self'",
    `img-src ${self}`,
    `connect-src ${self}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join("; ");
}

/**
 * @param {string} html @param {string} data
 * @returns {string} html with the CSP <meta> ahead of any script: right after <meta charset>
 *   (which has to stay within the first 1024 bytes), else first in <head>.
 */
export function withCsp(html, data = "") {
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error("page already has a CSP <meta>");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScriptHashes(html), data)}"/>`;
  const anchor = /<meta charset=[^>]*>/i.exec(html) ?? /<head[^>]*>/i.exec(html);
  if (!anchor) throw new Error("no <head> to put the CSP in");
  const end = anchor.index + anchor[0].length;
  return html.slice(0, end) + meta + html.slice(end);
}

// Response headers for hosts that read a _headers file. frame-ancestors only works as a header.
export const HEADERS = `/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=()
`;

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => join(e.parentPath, e.name));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "out";
  const data = dataOrigin(process.env.NEXT_PUBLIC_DATA_URL);
  const files = htmlFiles(out);
  for (const file of files) writeFileSync(file, withCsp(readFileSync(file, "utf8"), data));
  writeFileSync(join(out, "_headers"), HEADERS);
  console.log(`csp: ${files.length} page(s)${data ? `, data from ${data}` : ""}`);
}
