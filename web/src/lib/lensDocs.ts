// Where the gallery points for argus-lens docs, and the "Captioned by" line built from recorded data.
//
// Until lens's docs are imported into /docs (issue #16 follow-up), every help link goes to lens's README
// at the source the gallery was baked with: the release tag for a release, the commit for a dev build.
// Keeping the links here means the import only has to change this file.

import type { CaptionRecord } from "./types";

export const LENS_REPO = "https://github.com/smk762/argus-lens";
const PYPI = "https://pypi.org/project/argus-lens";

/** README sections the UI links to. The anchors are the same at every lens release from 0.7.0 on. */
export const LENS_SECTIONS = {
  overview: { anchor: "", title: "Overview" },
  assembly: { anchor: "what-the-assembly-pipeline-does", title: "What the assembly pipeline does" },
  features: { anchor: "features", title: "Features and backends" },
  cli: { anchor: "cli", title: "Command-line interface" },
  refine: { anchor: "refinement-llm-rewrite-validated", title: "Refinement (LLM rewrite, validated)" },
  xmp: { anchor: "immich", title: "XMP sidecars and Immich" },
} as const;
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

export function lensDocUrl(section: LensSection, version: string | undefined | null): string {
  const { anchor } = LENS_SECTIONS[section];
  return `${LENS_REPO}/blob/${lensSource(version).ref}/README.md${anchor ? `#${anchor}` : ""}`;
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
