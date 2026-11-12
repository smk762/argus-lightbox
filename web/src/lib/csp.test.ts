// The post-build CSP step (scripts/csp.mjs). Browser behaviour is checked by hand;
// this pins what goes into the policy and where it lands in the page.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { dataOrigin, inlineScriptHashes, policy, withCsp } from "../../scripts/csp.mjs";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const page =
  '<!DOCTYPE html><html><head><meta charSet="utf-8"/><script src="/_next/a.js" async=""></script></head>' +
  "<body><script>self.__next_f=[]</script><script></script></body></html>";

describe("csp post-build", () => {
  it("hashes inline scripts only", () => {
    expect(inlineScriptHashes(page)).toEqual([sha("self.__next_f=[]")]);
  });

  it("puts the policy right after <meta charset>, ahead of every script", () => {
    const html = withCsp(page);
    const meta = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(html.indexOf("charSet"));
    expect(meta).toBeLessThan(html.indexOf("<script"));
    expect(html).toContain(sha("self.__next_f=[]"));
    expect(() => withCsp(html)).toThrow();
  });

  it("allows a cross-origin data URL for fetches and images only", () => {
    expect(dataOrigin("https://data.example.com/lightbox/")).toBe("https://data.example.com");
    expect(dataOrigin("/data")).toBe("");
    const p = policy([], "https://data.example.com");
    expect(p).toContain("connect-src 'self' https://data.example.com");
    expect(p).toContain("img-src 'self' https://data.example.com");
    expect(p).toMatch(/script-src 'self';/);
    expect(p).toContain("object-src 'none'");
  });
});
