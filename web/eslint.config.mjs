import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The CSP (scripts/csp.mjs) hashes Next's own inline scripts and blocks HTML sinks with Trusted Types.
  // These keep new code from needing a policy change: no injected HTML, no inline <script> or <style>.
  {
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='script']:not(:has(JSXAttribute[name.name='src']))",
          message: "No inline <script>: the CSP only allows hashed Next scripts. Load a same-origin file with src.",
        },
        {
          selector: "JSXOpeningElement[name.name='style']",
          message: "No inline <style>: the CSP forbids it. Use a class in globals.css.",
        },
      ],
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "next/script", message: "next/script injects inline scripts the CSP doesn't hash." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".wrangler/**", // wrangler pages dev scratch
    "vendor/**", // the vendored Dragonhound shared layer: checked by sync-shared.mjs, edited upstream
  ]),
]);

export default eslintConfig;
