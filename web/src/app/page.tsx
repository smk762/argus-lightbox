import { Lightbox } from "@/components/Lightbox";
import { buildTimeIndex, prerenderGallery } from "@/lib/prerender";
import { PAGE_SIZE } from "@/lib/urlState";

// Static export: this runs once, at build time. A prerendered build (LIGHTBOX_PRERENDER=1) bakes the
// first page of the grid and the facet counts into the HTML; otherwise the page loads the index.
export default function Page() {
  const index = buildTimeIndex();
  return <Lightbox initial={index ? prerenderGallery(index, PAGE_SIZE) : null} />;
}
