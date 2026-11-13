import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";

import { DemoBanner } from "@/components/DemoBanner";

import { SITE_TITLE, pageMetadata } from "./siteMetadata";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

// The hosted demo's devtools easter egg. Same-origin file, so the CSP's script-src 'self' allows it,
// and it is server-rendered markup (no script-src set from JS, which Trusted Types would block).
const CONSOLE_EGG = process.env.NEXT_PUBLIC_DEMO_BANNER
  ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/dragonhound-console.js`
  : null;

export const metadata: Metadata = pageMetadata(
  SITE_TITLE,
  "A photo gallery navigated by argus-lens structured captions: filter by wardrobe, setting, lighting and more, and see how each caption was assembled.",
  "/",
);

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
