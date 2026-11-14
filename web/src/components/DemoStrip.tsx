// The Dragonhound Labs family bar, rendered natively from the vendored source (vendor/dh/dh-strip.mjs,
// dh-shared 1.2.0): links, labels and mark come from there, so a re-sync updates it with no hand copy.
// Styles are vendor/dh/dh-strip.css (imported by globals.css). No JS. src/lib/shared.test.ts checks the
// rendered markup against the module's own stripHtml(). Only the hosted demo carries it
// (NEXT_PUBLIC_DEMO_BANNER).
import { strip } from "../../vendor/dh/dh-strip.mjs";

export type StripSite = (typeof strip.links)[number]["site"];

/** The strip, with this site's link marked current. Same-tab links: *.dragonhound.dev is one family. */
export function DemoStrip({ current = "lightbox" }: { current?: StripSite }) {
  const { home } = strip;
  return (
    <nav className="dh-strip" aria-label={strip.ariaLabel} data-dh-site={current}>
      <a className="dh-strip-home" href={home.href} data-dh-site={home.site}>
        <svg
          className="dh-strip-mark"
          viewBox="0 0 100 100"
          width="18"
          height="18"
          aria-hidden="true"
          focusable="false"
        >
          <path fillRule="evenodd" d={strip.markPath} />
        </svg>
        <span className="dh-strip-name">{home.label}</span>
      </a>
      <ul className="dh-strip-links">
        {strip.links.map((link) => (
          <li key={link.site}>
            <a href={link.href} data-dh-site={link.site} aria-current={link.site === current ? "page" : undefined}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="dh-strip-label">
        {strip.label}
        <span className="dh-strip-more">{strip.labelMore}</span>
      </p>
    </nav>
  );
}

/** The hosted demo's strip, or nothing in a local or folder gallery. */
export function HostedDemoStrip() {
  return process.env.NEXT_PUBLIC_DEMO_BANNER ? <DemoStrip /> : null;
}
