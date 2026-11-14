"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadIndex } from "@/lib/data";
import { LENS_SECTIONS, type LensSection, captionSettings, lensPypiUrl, lensSource, lensTreeUrl } from "@/lib/lensDocs";
import type { CaptionParams } from "@/lib/types";

import { ExternalLink } from "./ExternalLink";
import { LensDocLink } from "./LensDocLink";

const LINK = "text-accent-tertiary underline underline-offset-2 hover:decoration-2";

// What each linked section answers, in the order a reader of this gallery needs them.
const GUIDE: { section: LensSection; blurb: string }[] = [
  { section: "overview", blurb: "What lens is, install extras, and a quick start." },
  {
    section: "assembly",
    blurb: "How raw tags and prose become category buckets, variants and a token-budgeted caption. The Explain and Compare tabs show this per photo.",
  },
  { section: "features", blurb: "Backends (tagger, prose, hybrid, cloud) and what each one records." },
  { section: "refine", blurb: "The optional LLM rewrite, and the checks a rewrite has to pass to be kept." },
  { section: "xmp", blurb: "The XMP sidecar: keywords and description, merged into an existing file." },
  { section: "cli", blurb: "The argus-lens command." },
];

/**
 * /docs: the lens version this gallery was baked with, and where its docs live. A prerendered build
 * passes the version in (*initial*), so the page is complete in its HTML; otherwise it reads the index.
 */
export function LensDocs({
  initial = null,
}: {
  initial?: { lensVersion: string; captionParams: CaptionParams | null } | null;
}) {
  const [version, setVersion] = useState<string | null>(initial?.lensVersion ?? null);
  const [settings, setSettings] = useState<string | null>(initial ? captionSettings(initial.captionParams) : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    const ctrl = new AbortController();
    loadIndex(ctrl.signal)
      .then((index) => {
        setVersion(index.lens_version);
        setSettings(captionSettings(index.caption_params));
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [initial]);

  const src = version ? lensSource(version) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-6">
      <header className="py-6">
        <nav aria-label="Site" className="mb-4 text-small">
          <Link href="/" className={LINK}>
            Back to the gallery
          </Link>
        </nav>
        <h1 className="font-display text-display font-semibold tracking-tight">argus-lens docs</h1>
        <p className="mt-1 text-small text-text-secondary" role="status">
          {src ? (
            <>
              This gallery was captioned with argus-lens <span className="font-medium text-text-primary">{src.version}</span>
              {src.sha && (
                <>
                  {" "}
                  at <code>{src.sha}</code>
                </>
              )}
              .{" "}
              <ExternalLink href={lensPypiUrl(src.version)} className={LINK}>
                {src.release ? `argus-lens ${src.version} on PyPI` : "argus-lens on PyPI"}
              </ExternalLink>
              {" · "}
              <ExternalLink href={lensTreeUrl(src.version)} className={LINK}>
                Source at {src.release ? src.ref : (src.sha ?? "dev")}
              </ExternalLink>
            </>
          ) : error ? (
            `Couldn't read the lens version: ${error}`
          ) : (
            "Loading…"
          )}
        </p>
        {settings && <p className="mt-1 text-small text-text-secondary">{settings}</p>}
      </header>

      <main className="flex-1 space-y-6 pb-10">
        <p className="text-body leading-relaxed text-text-secondary">
          Lens turns a captioning model&apos;s raw output into structured captions: it sorts tags and prose fragments
          into categories (identity, wardrobe, pose, setting, lighting, action), then writes one caption per category
          plus training and zero-shot variants. Lightbox&apos;s filters are those categories.
        </p>

        <section aria-labelledby="sections">
          <h2 id="sections" className="mb-3 font-display text-heading font-semibold">
            Sections
          </h2>
          {version ? (
            <ul className="space-y-3">
              {GUIDE.map(({ section, blurb }) => (
                <li key={section} className="rounded-md border border-base-700 bg-base-800 p-3">
                  <LensDocLink section={section} version={version}>
                    {LENS_SECTIONS[section].title}
                  </LensDocLink>
                  <p className="mt-1 text-small text-text-secondary">{blurb}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-text-muted">The links appear once the lens version is known.</p>
          )}
        </section>

        <p className="text-caption text-text-muted">
          These links open lens&apos;s README at the version above, so they match the captions in this gallery. A
          reference for every caption-result field and a table of the prose prompt presets are not written yet; they
          will be added here when lens publishes them.
        </p>
      </main>
    </div>
  );
}
