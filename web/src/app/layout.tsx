import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";

import { DemoBanner } from "@/components/DemoBanner";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

const TITLE = "Argus Lightbox";
const DESCRIPTION =
  "A photo gallery navigated by argus-lens structured captions: filter by wardrobe, setting, lighting and more, and see how each caption was assembled.";
// Absolute origin for og:image and the canonical URL. Unset, Next would resolve the image
// against localhost, so the share image is only emitted when the origin is known.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "The Lightbox gallery filtered by caption facets" };
// The hosted demo's devtools easter egg. Same-origin file, so the CSP's script-src 'self' allows it,
// and it is server-rendered markup (no script-src set from JS, which Trusted Types would block).
const CONSOLE_EGG = process.env.NEXT_PUBLIC_DEMO_BANNER
  ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/dragonhound-console.js`
  : null;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...(SITE_URL && { metadataBase: new URL(SITE_URL), alternates: { canonical: "/" } }),
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    ...(SITE_URL && { images: [OG_IMAGE] }),
  },
  twitter: {
    card: SITE_URL ? "summary_large_image" : "summary",
    title: TITLE,
    description: DESCRIPTION,
    ...(SITE_URL && { images: [OG_IMAGE.url] }),
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <body className="min-h-dvh">
        <DemoBanner />
        {children}
        {CONSOLE_EGG && <script src={CONSOLE_EGG} async />}
      </body>
    </html>
  );
}
