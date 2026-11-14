import type { Metadata } from "next";

import { SITE_TITLE, pageMetadata } from "./siteMetadata";

import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// The hosted demo's devtools easter egg. Same-origin file, so the CSP's script-src 'self' allows it,
// and it is server-rendered markup (no script-src set from JS, which Trusted Types would block).
const CONSOLE_EGG = process.env.NEXT_PUBLIC_DEMO_BANNER
  ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/dragonhound-console.js`
  : null;

export const metadata: Metadata = {
  ...pageMetadata(
    SITE_TITLE,
    "A photo gallery navigated by argus-lens structured captions: filter by wardrobe, setting, lighting and more, and see how each caption was assembled.",
    "/",
  ),
  // The argus-lens package mark (Lightbox demonstrates lens), dark variant on a dark tile. Source:
  // argus-cortex brand/packages/lens/; the PNG and ICO sizes are rendered from it.
  icons: {
    icon: [
      { url: `${BASE}/favicon.svg`, type: "image/svg+xml" },
      { url: `${BASE}/favicon.ico`, sizes: "32x32" },
    ],
    apple: `${BASE}/apple-touch-icon.png`,
  },
  manifest: `${BASE}/site.webmanifest`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark-only by design (photos read best on a deep neutral): the shared tokens' dark values, locked,
    // so dh-theme.js and the family's theme cookie don't apply here and the script isn't loaded.
    <html lang="en" data-theme="dark" data-dh-theme-lock="">
      <body className="min-h-dvh">
        {children}
        {CONSOLE_EGG && <script src={CONSOLE_EGG} async />}
      </body>
    </html>
  );
}
