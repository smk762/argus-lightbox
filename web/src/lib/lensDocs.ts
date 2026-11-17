// Where the gallery points for argus-lens docs, and the "Captioned by" line built from recorded data.
//
// Until lens's docs are imported into /docs (#21), every help link goes to lens's README or docs/ files
// at the source the gallery was baked with: the release tag for a release, the commit for a dev build.
// A section that lens added later (`since`) links to the first release that has it when the bake is older.
// Keeping the links here means the import only has to change this file.

import type { CaptionParams, CaptionRecord } from "./types";

export const LENS_REPO = "https://github.com/smk762/argus-lens";
const PYPI = "https://pypi.org/project/argus-lens";

interface SectionDef {
  anchor: string;
  title: string;
  /** The file in lens's repo; README.md when unset. */
  file?: string;
  /** The first lens release with this file and anchor, when it is newer than 0.7.0. */
  since?: string;
}

/** Sections the UI links to. README anchors are the same at every lens release from 0.7.0 on. */
export const LENS_SECTIONS = {
  overview: { anchor: "", title: "Overview" },
  assembly: { anchor: "what-the-assembly-pipeline-does", title: "What the assembly pipeline does" },
  features: { anchor: "features", title: "Features and backends" },
  cli: { anchor: "cli", title: "Command-line interface" },
  refine: { anchor: "refinement-llm-rewrite-validated", title: "Refinement (LLM rewrite, validated)" },
  xmp: { anchor: "immich", title: "XMP sidecars and Immich" },
  captionResult: { anchor: "", title: "Caption result reference", file: "docs/caption-result.md", since: "0.11.0" },
  resultFields: { anchor: "fields", title: "Caption result fields", file: "docs/caption-result.md", since: "0.11.0" },
  resultMetadata: { anchor: "metadata", title: "Caption result metadata", file: "docs/caption-result.md", since: "0.11.0" },
  cliReference: { anchor: "", title: "CLI reference", file: "docs/cli.md", since: "0.11.0" },
} as const satisfies Record<string, SectionDef>;
export type LensSection = keyof typeof LENS_SECTIONS;

export interface LensSource {
  /** The version string recorded in index.json. */
  version: string;
  /** Git ref the docs links use: `v<version>` for a release, the commit for a dev build, else `dev`. */
  ref: string;
  /** Short commit sha, when the version carries one (setuptools-scm `+g<sha>`). */
  sha: string | null;
  /** True for a plain X.Y.Z release, which has a PyPI page and a tag. */
  release: boolean;
}

const RELEASE = /^\d+\.\d+\.\d+$/;
const SCM_SHA = /\+g([0-9a-f]{7,40})(?:\.|$)/;

export function lensSource(version: string | undefined | null): LensSource {
  const v = (version ?? "").trim();
  if (RELEASE.test(v)) return { version: v, ref: `v${v}`, sha: null, release: true };
  const sha = SCM_SHA.exec(v)?.[1] ?? null;
  return { version: v, ref: sha ?? "dev", sha: sha ? sha.slice(0, 7) : null, release: false };
}

const LEADING = /^(\d+)\.(\d+)\.(\d+)/;

/** True when *version*'s leading X.Y.Z is older than *since*; false when it has none (dev). */
function olderThan(version: string | undefined | null, since: string): boolean {
  const a = LEADING.exec((version ?? "").trim());
  const b = LEADING.exec(since);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]);
  }
  return false;
}

export function lensDocUrl(section: LensSection, version: string | undefined | null): string {
  const def: SectionDef = LENS_SECTIONS[section];
  const ref = def.since && olderThan(version, def.since) ? `v${def.since}` : lensSource(version).ref;
  return `${LENS_REPO}/blob/${ref}/${def.file ?? "README.md"}${def.anchor ? `#${def.anchor}` : ""}`;
}

export function lensTreeUrl(version: string | undefined | null): string {
  return `${LENS_REPO}/tree/${lensSource(version).ref}`;
}

/** The PyPI page for a release; the project page otherwise (dev builds aren't published). */
export function lensPypiUrl(version: string | undefined | null): string {
  const src = lensSource(version);
  return src.release ? `${PYPI}/${src.version}/` : `${PYPI}/`;
}

export interface CaptionedBy {
  lensVersion: string;
  backend: string;
  /** The rewriter model, when lens recorded a refine outcome with one. */
  refineModel: string | null;
  /** Whether lens kept the rewrite for at least one variant. */
  refineAccepted: boolean;
  /** Why lens skipped the rewrite, when it says. */
  refineSkipped: string | null;
}

/**
 * Who captioned this photo, from what the bake recorded and nothing else. Lens records the backend name
 * (e.g. `hybrid`) but not the prose model or prompt preset, so those aren't shown.
 */
export function captionedBy(caption: CaptionRecord, lensVersion: string): CaptionedBy {
  const refine = caption.refine;
  return {
    lensVersion,
    backend: caption.backend_name || "",
    refineModel: refine?.model || null,
    refineAccepted: (refine?.accepted?.length ?? 0) > 0,
    refineSkipped: refine?.skipped || null,
  };
}

/** One clause for the refine outcome, or null when lens recorded none. */
export function refineSummary(by: CaptionedBy): string | null {
  if (by.refineSkipped) return `LLM rewrite skipped (${by.refineSkipped})`;
  if (!by.refineModel) return null;
  return by.refineAccepted ? `refined by ${by.refineModel}` : `${by.refineModel}'s rewrite was not kept`;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * How the gallery was captioned, from the run settings the bake recorded, or null when it recorded none.
 * A prompt with no spaces is a lens preset name; anything else is literal prompt text and is called custom.
 */
export function captionSettings(params: CaptionParams | null | undefined): string | null {
  if (!params) return null;
  const parts: string[] = [];
  const tagModel = text(params.tag_model);
  const proseModel = text(params.prose_model);
  const prompt = text(params.prose_prompt);
  const fallback = text(params.prose_prompt_default);
  const refineModel = text(params.refine_model);
  if (tagModel) parts.push(`Tags by ${tagModel}.`);
  if (proseModel || prompt) {
    let prose = `Prose by ${proseModel ?? "the prose model"}`;
    if (prompt && !/\s/.test(prompt)) {
      prose += ` with lens's "${prompt}" prompt preset`;
      if (fallback && fallback !== prompt) prose += ` (lens's default is "${fallback}")`;
    } else if (prompt) {
      prose += " with a custom prompt";
    }
    parts.push(`${prose}.`);
  }
  if (refineModel) parts.push(`Checked rewrite by ${refineModel}.`);
  return parts.length ? parts.join(" ") : null;
}
