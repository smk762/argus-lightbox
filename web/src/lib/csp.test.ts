// The post-build CSP step (scripts/csp.mjs). Browser behaviour is checked by hand;
// this pins what goes into the policy and where it lands in the page.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { dataOrigin, headers, inlineScriptHashes, policy, trustedTypesPolicy, withCsp } from "../../scripts/csp.mjs";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const page =
  '<!DOCTYPE html><html><head><meta charSet="utf-8"/><script src="/_next/a.js" async=""></script></head>' +
  "<body><script>self.__next_f=[]</script><script></script></body></html>";

describe("csp post-build", () => {
  it("hashes inline scripts only", () => {
    expect(inlineScriptHashes(page)).toEqual([sha("self.__next_f=[]")]);
  });

  it("puts the policy right after <meta charset>, then the Trusted Types policy, ahead of every script", () => {
    const html = withCsp(page);
    const meta = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(html.indexOf("charSet"));
    expect(meta).toBeLessThan(html.indexOf("<script"));
    expect(html.indexOf(`<script>${trustedTypesPolicy()}</script>`)).toBe(html.indexOf("<script"));
    expect(html).toContain(sha("self.__next_f=[]"));
    expect(html).toContain(sha(trustedTypesPolicy()));
    expect(html).toContain("require-trusted-types-for 'script'; trusted-types default");
    expect(() => withCsp(html)).toThrow();
  });

  it("lets the default Trusted Types policy pass only same-origin Next chunk URLs", () => {
    const run = (basePath: string) => {
      let rules: { createScriptURL: (s: string) => string | null } | undefined;
      const trustedTypes = { createPolicy: (name: string, r: typeof rules) => ((rules = r), expect(name).toBe("default")) };
      new Function("self", "trustedTypes", "location", trustedTypesPolicy(basePath))(
        { trustedTypes },
        trustedTypes,
        { href: "https://demo.example/x/", origin: "https://demo.example" },
      );
      return rules!.createScriptURL;
    };
    const root = run("");
    // Unchanged, not absolutised: Turbopack matches loaded chunks by their src attribute.
    expect(root("/_next/static/chunks/0y9r-r-~jfsk5.js")).toBe("/_next/static/chunks/0y9r-r-~jfsk5.js");
    expect(root("https://demo.example/_next/static/chunks/a.js")).toBe("https://demo.example/_next/static/chunks/a.js");
    expect(root("https://evil.example/_next/static/chunks/a.js")).toBeNull();
    expect(root("/_next/static/../../evil.js")).toBeNull();
    expect(root("/_next/static/chunks/a.css")).toBeNull();
    expect(root("data:text/javascript,alert(1)")).toBeNull();
    const sub = run("/gallery/");
    expect(sub("/gallery/_next/static/chunks/a.js")).toBe("/gallery/_next/static/chunks/a.js");
    expect(sub("/_next/static/chunks/a.js")).toBeNull();
  });

  it("caches Next's hashed assets for good, under the base path", () => {
    expect(headers()).toContain("/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable");
    expect(headers("/gallery")).toContain("/gallery/_next/static/*\n");
    expect(headers()).toContain("frame-ancestors 'none'");
    expect(headers()).toContain("Strict-Transport-Security: max-age=31536000");
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
