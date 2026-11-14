// Display metadata for lens's caption categories and the extra facet groups.
// Colours: the shared tokens for status hues, a local categorical palette for the rest (see globals.css).

export interface GroupStyle {
  label: string;
  color: string; // CSS colour (a token var)
  blurb: string;
}

export const STYLES: Readonly<Record<string, GroupStyle>> = {
  identity: { label: "Identity", color: "var(--color-accent-primary)", blurb: "Who is in frame: hair, face, age." },
  wardrobe: { label: "Wardrobe", color: "var(--color-warm-primary)", blurb: "Clothing and accessories." },
  pose_composition: {
    label: "Pose & composition",
    color: "var(--color-accent-secondary)",
    blurb: "Body pose, framing, camera angle.",
  },
  setting: { label: "Setting", color: "var(--color-success)", blurb: "Where the photo was taken." },
  lighting: { label: "Lighting", color: "var(--color-warning)", blurb: "Time of day and quality of light." },
  action: { label: "Action", color: "var(--color-accent-tertiary)", blurb: "What the subject is doing." },
  detail: {
    label: "Other details",
    color: "var(--color-text-muted)",
    blurb: "Ordinary tags that matched no category hint.",
  },
  people: { label: "People", color: "var(--color-warm-secondary)", blurb: "Lens's headcount estimate." },
  camera: { label: "Camera", color: "var(--color-text-secondary)", blurb: "From the photo's EXIF." },
  training: { label: "Training", color: "var(--color-info)", blurb: "Identity-suppressed variant for LoRA training." },
  training_prose: { label: "Training (prose)", color: "var(--color-info)", blurb: "Prose form of the training variant." },
  zeroshot: { label: "Zero-shot", color: "var(--color-text-secondary)", blurb: "Identity-first variant for generation." },
};

export function groupStyle(key: string): GroupStyle {
  return (
    STYLES[key] ?? {
      label: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      color: "var(--color-text-muted)",
      blurb: "",
    }
  );
}
