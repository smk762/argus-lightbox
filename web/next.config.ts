import type { NextConfig } from "next";

// A fully static site: `next build` writes out/, which any static host (or an
// R2 bucket behind Cloudflare) can serve. There is no server and no API route —
// the gallery is driven entirely by the baked data directory (NEXT_PUBLIC_DATA_URL).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  trailingSlash: true,
};

export default nextConfig;
