// Where a build finds the baked data, and whether it prerenders from it. No filesystem access, so
// the server components can import it (src/lib/prerender.ts) without Turbopack tracing the project.

/** @param {Record<string, string | undefined>} env @returns {boolean} */
export function prerenderEnabled(env) {
  return env.LIGHTBOX_PRERENDER === "1";
}

/**
 * The baked data directory relative to public/ (and out/), or null when the data is served from
 * another origin (NEXT_PUBLIC_DATA_URL is an http(s) URL) and so isn't part of the build.
 * @param {Record<string, string | undefined>} env @returns {string | null}
 */
export function localDataDir(env) {
  const url = env.NEXT_PUBLIC_DATA_URL;
  if (url && /^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  const base = (env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  let path = url || "/data";
  if (base && url && path.startsWith(`${base}/`)) path = path.slice(base.length);
  return path.replace(/^\/+|\/+$/g, "") || null;
}
