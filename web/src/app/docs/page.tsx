import type { Metadata } from "next";

import { LensDocs } from "@/components/LensDocs";

export const metadata: Metadata = {
  title: "Lens docs · Argus Lightbox",
  description: "What argus-lens is, and where its docs are, for the lens version this gallery was captioned with.",
  // The root layout's canonical is "/"; this page is its own.
  ...(process.env.NEXT_PUBLIC_SITE_URL && { alternates: { canonical: "/docs/" } }),
};

export default function DocsPage() {
  return <LensDocs />;
}
