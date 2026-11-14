// The baked index contract (bake/src/lightbox_bake/index.py). `caption` keeps
// argus-lens's CaptionResult field names so a live /caption response fits the
// same shape.

export type Category = string;

export interface CaptionRecord {
  final_caption: string;
  caption_variants: Record<string, string>;
  selected_category: string;
  raw_tags: string;
  raw_prose: string;
  backend_name: string;
  profile?: Record<string, unknown>;
  version?: number;
  /** Present when lens rewrote the assembled caption, or skipped that rewrite. */
  refine?: { model?: string; accepted?: string[]; skipped?: string };
}

export interface Subjects {
  count: number | null;
  multiple: boolean;
  agree: boolean;
  evidence: string[];
}

export interface Explain {
  buckets: { tags: Record<string, string[]>; prose: Record<string, string[]> };
  compaction_notes: string[];
  subjects: Subjects | null;
  drift: boolean;
}

export interface Composed {
  final_caption: string;
  caption_variants: Record<string, string>;
}

export interface Exif {
  camera?: string;
  lens?: string;
  focal_length_mm?: number;
  focal_length_35mm?: number;
  aperture?: number;
  shutter?: string;
  exposure_s?: number;
  iso?: number;
  taken_at?: string;
  software?: string;
}

export interface Photo {
  id: string;
  sha256: string;
  image: string;
  thumb: string;
  xmp: string;
  width: number;
  height: number;
  color: string;
  caption: CaptionRecord;
  explain: Explain;
  compare: Partial<Record<"tags" | "prose" | "hybrid", Composed>>;
  facets: Record<string, string[]>;
  exif: Exif;
  provenance: Record<string, string>;
}

export interface GalleryIndex {
  version: string;
  generated_at: string;
  source: "fixture" | "tape" | "folder" | string;
  lens_version: string;
  categories: Category[];
  photos: Photo[];
  /** Folder bakes: images not in `photos` yet. Absent once a fixture or tape bake is written. */
  queue?: number;
  /** Index 1.1+: the run settings every caption was recorded with, when all photos agree. */
  caption_params?: CaptionParams;
}

/** Run settings recorded with a caption (cortex `caption.params`). Every field is optional. */
export interface CaptionParams {
  tag_model?: string;
  prose_model?: string;
  /** A lens prompt preset name, or the literal prompt text. */
  prose_prompt?: string;
  /** Lens's default preset at the recorded version, when the run used another one. */
  prose_prompt_default?: string;
  refine_model?: string;
  [key: string]: unknown;
}

export const SUPPORTED_INDEX_MAJOR = "1";
