// Which caption the grid and the detail view show first.
//
// Lens records one `final_caption` (the variant picked at caption time, `identity` for the tape) plus
// every variant in `caption_variants`. The recorded caption stays the truth; this only picks which
// text to put in front of the viewer. `NEXT_PUBLIC_DEFAULT_CAPTION` names a variant key, or `final`
// for lens's own pick. It is inlined at build time.

import type { CaptionRecord } from "./types";

/** The variant shown when the build doesn't name one. */
export const FALLBACK_CAPTION = "zeroshot";

/** The build's configured default: a `caption_variants` key, or `final`. */
export const DEFAULT_CAPTION = (process.env.NEXT_PUBLIC_DEFAULT_CAPTION || FALLBACK_CAPTION).trim();

export interface ShownCaption {
  text: string;
  /** The variant the text came from; `final` when it is lens's `final_caption`. */
  variant: string;
  /** True when the requested variant was missing or empty and the final caption stood in. */
  fellBack: boolean;
}

/** The caption to display for *caption*: the *preferred* variant when it has text, else `final_caption`. */
export function shownCaption(
  caption: Pick<CaptionRecord, "final_caption" | "caption_variants">,
  preferred: string = DEFAULT_CAPTION,
): ShownCaption {
  const want = preferred.trim() || FALLBACK_CAPTION;
  if (want === "final") return { text: caption.final_caption, variant: "final", fellBack: false };
  const text = caption.caption_variants?.[want]?.trim();
  if (text) return { text, variant: want, fellBack: false };
  return { text: caption.final_caption, variant: "final", fellBack: true };
}

/**
 * Short alt text for the detail image: the caption's first sentence (or first clause of a tag list), cut at a
 * word boundary near *max* characters. The full caption is on screen beside the image, in the Caption tab, so
 * a screen reader doesn't need to hear a long tag list twice.
 */
export function altText(caption: string, max = 125): string {
  const text = caption.trim().replace(/\s+/g, " ");
  const sentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max + 1);
  const at = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return `${cut.slice(0, at > max / 2 ? at : max).replace(/[,;:]$/, "")}…`;
}
