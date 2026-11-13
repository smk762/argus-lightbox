// The one way this app links off-site (GitHub, PyPI, Wikimedia, the sibling demo sites): opens in a
// new tab without handing the new page a window.opener or a Referer, and tells screen readers so.
// Same-site links stay plain <a>/<Link>.

import type { AnchorHTMLAttributes } from "react";

export function ExternalLink({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
