// Cross-promotion for what this demo deliberately leaves out. Face grouping and content rating are
// the curator (argus-cull), which runs in Argus Studio's Curate demo. The full pipeline lives in the
// suite UI (Argus Studio). Live demos are linked where one exists; the repos where they are the point.

import { CURATE_URL, LABS_URL, REALMS_URL, STUDIO_URL } from "@/lib/links";

import { ExternalLink } from "./ExternalLink";

const CULL_REPO = "https://github.com/smk762/argus-cull";
const LENS_URL = "https://github.com/smk762/argus-lens";
const LINK = "text-link underline underline-offset-2 hover:decoration-2";

export function SuiteLinks() {
  return (
    <div className="mt-6 space-y-3 rounded-lg border border-base-700 bg-base-800 p-4 text-small">
      <p className="font-display font-semibold">Looking for faces or content filters?</p>
      <p className="text-text-secondary">
        Face grouping and content rating are the curator&apos;s job (
        <ExternalLink className={LINK} href={CULL_REPO}>
          argus-cull
        </ExternalLink>
        ): try it in{" "}
        <ExternalLink className={LINK} href={CURATE_URL}>
          Argus Studio&apos;s Curate demo
        </ExternalLink>
        . Its XMP output merges into the same sidecars lens writes.
      </p>
      <p className="text-text-secondary">
        See the whole pipeline (acquire, curate, caption, train, validate) in{" "}
        <ExternalLink className={LINK} href={STUDIO_URL}>
          Argus Studio
        </ExternalLink>
        , or caption your own library with{" "}
        <ExternalLink className={LINK} href={LENS_URL}>
          <code>pip install argus-lens</code>
        </ExternalLink>
        .
      </p>
    </div>
  );
}

/** The sibling demos, for the footer. */
export function DemoLinks({ className = LINK }: { className?: string }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span className="text-text-muted">More demos:</span>
      <ExternalLink className={className} href={STUDIO_URL}>
        Argus Studio
      </ExternalLink>
      <ExternalLink className={className} href={REALMS_URL}>
        Atlas Realms
      </ExternalLink>
      <ExternalLink className={className} href={LABS_URL}>
        Dragonhound Labs
      </ExternalLink>
    </span>
  );
}
