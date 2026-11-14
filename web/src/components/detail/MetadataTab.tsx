"use client";

import { assetUrl } from "@/lib/data";
import type { ListPhoto } from "@/lib/types";

import { ExternalLink } from "../ExternalLink";
import { LensDocLink } from "../LensDocLink";
import { SectionTitle } from "../ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-base-700 py-1.5 text-small last:border-b-0">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function Link({ href, children }: { href?: string; children: React.ReactNode }) {
  return href ? (
    <ExternalLink href={href} className="text-link underline underline-offset-2 hover:decoration-2">
      {children}
    </ExternalLink>
  ) : (
    <>{children}</>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function MetadataTab({ photo, lensVersion }: { photo: ListPhoto; lensVersion: string }) {
  const { exif, provenance, caption } = photo;
  const hasExif = Object.keys(exif).length > 0;
  const profile = (caption.profile ?? {}) as Record<string, string>;
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle hint="GPS is never published">Camera</SectionTitle>
        {hasExif ? (
          <dl>
            <Row label="Camera">{exif.camera}</Row>
            <Row label="Lens">{exif.lens}</Row>
            <Row label="Focal length">
              {exif.focal_length_mm !== undefined &&
                `${exif.focal_length_mm} mm${exif.focal_length_35mm ? ` (${exif.focal_length_35mm} mm eq.)` : ""}`}
            </Row>
            <Row label="Aperture">{exif.aperture !== undefined && `ƒ/${exif.aperture}`}</Row>
            <Row label="Shutter">{exif.shutter}</Row>
            <Row label="ISO">{exif.iso}</Row>
            <Row label="Taken">{exif.taken_at && new Date(exif.taken_at).toLocaleString()}</Row>
          </dl>
        ) : (
          <p className="text-small text-text-muted">No EXIF in this image.</p>
        )}
      </section>

      {Object.keys(provenance).length > 0 && (
        <section>
          <SectionTitle>Provenance</SectionTitle>
          <dl>
            <Row label="Title">{provenance.title}</Row>
            <Row label="Author">
              {provenance.author && <Link href={provenance.author_url}>{provenance.author}</Link>}
            </Row>
            <Row label="Source">
              {provenance.source && <Link href={provenance.source_url}>{provenance.source}</Link>}
            </Row>
            <Row label="License">
              {provenance.license && <Link href={provenance.license_url}>{provenance.license}</Link>}
            </Row>
          </dl>
        </section>
      )}

      <section>
        <SectionTitle>Captioning</SectionTitle>
        <dl>
          <Row label="Backend">{caption.backend_name}</Row>
          <Row label="Target">
            {[profile.target_style, profile.target_category, profile.target_backend].filter(Boolean).join(" · ")}
          </Row>
          <Row label="Caption version">{caption.version}</Row>
          <Row label="SHA-256">
            <code className="text-caption" title={photo.sha256}>
              {photo.sha256.slice(0, 16)}…
            </code>
          </Row>
        </dl>
      </section>

      <section>
        <SectionTitle>Sidecars</SectionTitle>
        <p className="mb-3 text-caption text-text-muted">
          What lens writes next to the source image: the caption as <code>.txt</code> for trainers, and an XMP sidecar
          (keywords + description) that Lightroom, digiKam and Immich ingest. XMP writes merge, so curator can add
          faces and a content rating to the same file.{" "}
          <LensDocLink section="xmp" version={lensVersion}>
            Lens XMP sidecar docs
          </LensDocLink>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => download(`${photo.id}.txt`, caption.final_caption)}
            className="rounded-sm bg-interactive px-3 py-1.5 text-small font-medium text-white transition-colors hover:bg-interactive-hover"
          >
            Download .txt
          </button>
          <a
            href={assetUrl(photo.xmp)}
            download={`${photo.id}.xmp`}
            className="rounded-sm border border-base-600 px-3 py-1.5 text-small font-medium transition-colors hover:bg-base-600"
          >
            Download .xmp
          </a>
        </div>
      </section>
    </div>
  );
}
