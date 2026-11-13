// Slim strip above the gallery on the hosted demo. Opt-in at build time
// (NEXT_PUBLIC_DEMO_BANNER=1) so a local or folder gallery doesn't carry it.

const ORG_URL = "https://dragonhound.dev";
const REPO_URL = "https://github.com/smk762/argus-lightbox";

export function DemoBanner() {
  if (!process.env.NEXT_PUBLIC_DEMO_BANNER) return null;
  return (
    <div className="border-b border-base-700 bg-base-800 px-4 py-1.5 text-center text-caption text-text-secondary sm:px-6">
      <span className="text-text-primary">Argus Lightbox</span> — demo on recorded data ·{" "}
      <a className="text-accent-tertiary hover:underline" href={ORG_URL}>
        Dragonhound Labs
      </a>{" "}
      ·{" "}
      <a className="text-accent-tertiary hover:underline" href={REPO_URL}>
        GitHub
      </a>
    </div>
  );
}
