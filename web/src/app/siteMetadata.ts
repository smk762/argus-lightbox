import type { Metadata } from "next";

export const SITE_TITLE = "Argus Lightbox";
// Absolute origin for og:image and the canonical URL. Unset, Next would resolve the image
// against localhost, so the share image is only emitted when the origin is known.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "The Lightbox gallery filtered by caption facets" };

/**
 * Title, description, canonical and share-card metadata for one page. Next merges `openGraph` and
 * `twitter` shallowly, so a page that only set its title would inherit the layout's og:url ("/").
 */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    ...(SITE_URL && { metadataBase: new URL(SITE_URL), alternates: { canonical: path } }),
    openGraph: {
      type: "website",
      siteName: SITE_TITLE,
      title,
      description,
      ...(SITE_URL && { url: path, images: [OG_IMAGE] }),
    },
    twitter: {
      card: SITE_URL ? "summary_large_image" : "summary",
      title,
      description,
      ...(SITE_URL && { images: [OG_IMAGE.url] }),
    },
  };
}
