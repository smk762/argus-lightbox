import type { Metadata } from "next";

import { LensDocs } from "@/components/LensDocs";

import { SITE_TITLE, pageMetadata } from "../siteMetadata";

export const metadata: Metadata = pageMetadata(
  `Lens docs · ${SITE_TITLE}`,
  "What argus-lens is, and where its docs are, for the lens version this gallery was captioned with.",
  "/docs/",
);

export default function DocsPage() {
  return <LensDocs />;
}
