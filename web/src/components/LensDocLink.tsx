import { type LensSection, lensDocUrl } from "@/lib/lensDocs";

import { ExternalLink } from "./ExternalLink";

/** A link into lens's docs at the version this gallery was baked with. The text names the topic. */
export function LensDocLink({
  section,
  version,
  children,
}: {
  section: LensSection;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <ExternalLink
      href={lensDocUrl(section, version)}
      className="text-link underline underline-offset-2 hover:decoration-2"
    >
      {children}
    </ExternalLink>
  );
}
