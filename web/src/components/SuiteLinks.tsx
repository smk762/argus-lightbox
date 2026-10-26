// Cross-promotion for what this demo deliberately leaves out. Face grouping and
// content rating are the curator demo (argus-cull). The full pipeline lives in
// the suite UI (argus-studio).

const SUITE_URL = process.env.NEXT_PUBLIC_SUITE_URL || "https://github.com/smk762/argus-studio";
const CURATOR_URL = process.env.NEXT_PUBLIC_CURATOR_URL || "https://github.com/smk762/argus-cull";
const LENS_URL = "https://github.com/smk762/argus-lens";

export function SuiteLinks() {
  return (
    <aside className="mt-6 space-y-3 rounded-lg border border-base-700 bg-base-800 p-4 text-small">
      <p className="font-display font-semibold">Looking for faces or content filters?</p>
      <p className="text-text-secondary">
        Face grouping and content rating are{" "}
        <a className="text-accent-tertiary hover:underline" href={CURATOR_URL}>
          argus-cull
        </a>
        , the curator demo. Its XMP output merges into the same sidecars lens writes.
      </p>
      <p className="text-text-secondary">
        See the whole pipeline (acquire, curate, caption, train, validate) in{" "}
        <a className="text-accent-tertiary hover:underline" href={SUITE_URL}>
          Argus Studio
        </a>
        , or caption your own library with{" "}
        <a className="text-accent-tertiary hover:underline" href={LENS_URL}>
          <code>pip install argus-lens</code>
        </a>
        .
      </p>
    </aside>
  );
}
