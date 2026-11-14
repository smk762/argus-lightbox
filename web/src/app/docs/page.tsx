import type { Metadata } from "next";

import { LensDocs } from "@/components/LensDocs";
import { buildTimeIndex } from "@/lib/prerender";

import { SITE_TITLE, pageMetadata } from "../siteMetadata";

export const metadata: Metadata = pageMetadata(
  `Lens docs · ${SITE_TITLE}`,
  "What argus-lens is, and where its docs are, for the lens version this gallery was captioned with.",
  "/docs/",
);

export default function DocsPage() {
  const index = buildTimeIndex();
  return (
    <LensDocs
      initial={index ? { lensVersion: index.lens_version, captionParams: index.caption_params ?? null } : null}
    />
  );
}
