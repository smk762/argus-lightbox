import type { Metadata } from "next";
import Link from "next/link";

// Not the gallery, so no canonical pointing at "/" (inherited from the layout). Next adds noindex itself.
export const metadata: Metadata = { alternates: { canonical: null } };

// Static hosts serve out/404.html for unknown paths. Next's built-in page styles
// itself inline, which the strict CSP blocks, so this one uses the token classes.
export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 font-display text-heading font-semibold">Page not found</h1>
      <p className="text-text-secondary">
        The gallery lives on one page; filters and the open photo are in its URL.{" "}
        <Link href="/" className="text-accent-tertiary underline underline-offset-2 hover:decoration-2">
          Back to the gallery
        </Link>
      </p>
    </main>
  );
}
