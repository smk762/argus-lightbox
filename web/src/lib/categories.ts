// Display metadata for lens's caption categories and the extra facet groups.
// Colours: the shared categorical palette (--dh-cat-1..8 in vendor/dh/dh-tokens.css, colour-blind aware),
// one slot per group and never reassigned, so a group keeps its hue across releases. The six lens
// categories and People take slots 1-7 (no two share a hue); the neutral groups (other details, camera)
// and the zero-shot variant share slate (8), as they shared the muted grey before. The training variants
// reuse sky (7): variants are listed apart from the facet groups.
// globals.css mirrors this as [data-group] custom properties (prerender.test.ts keeps the two in step).

export interface GroupStyle {
  label: string;
  cat: number; // --dh-cat-N slot, 1-8
  color: string; // fill: dots, borders (3:1 non-text)
  ink: string; // text on the tint or the page
  tint: string; // background behind ink text
  blurb: string;
}

const cat = (n: number) => ({
  cat: n,
  color: `var(--dh-cat-${n})`,
  ink: `var(--dh-cat-${n}-ink)`,
  tint: `var(--dh-cat-${n}-tint)`,
});

export const STYLES: Readonly<Record<string, GroupStyle>> = {
  identity: { label: "Identity", ...cat(1), blurb: "Who is in frame: hair, face, age." },
  lighting: { label: "Lighting", ...cat(2), blurb: "Time of day and quality of light." },
  setting: { label: "Setting", ...cat(3), blurb: "Where the photo was taken." },
  pose_composition: { label: "Pose & composition", ...cat(4), blurb: "Body pose, framing, camera angle." },
  wardrobe: { label: "Wardrobe", ...cat(5), blurb: "Clothing and accessories." },
  people: { label: "People", ...cat(6), blurb: "Lens's headcount estimate." },
  action: { label: "Action", ...cat(7), blurb: "What the subject is doing." },
  detail: { label: "Other details", ...cat(8), blurb: "Ordinary tags that matched no category hint." },
  camera: { label: "Camera", ...cat(8), blurb: "From the photo's EXIF." },
  training: { label: "Training", ...cat(7), blurb: "Identity-suppressed variant for LoRA training." },
  training_prose: { label: "Training (prose)", ...cat(7), blurb: "Prose form of the training variant." },
  zeroshot: { label: "Zero-shot", ...cat(8), blurb: "Identity-first variant for generation." },
};

export function groupStyle(key: string): GroupStyle {
  return (
    STYLES[key] ?? {
      label: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      ...cat(8),
      blurb: "",
    }
  );
}
