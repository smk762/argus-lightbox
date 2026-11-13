import Link from "next/link";

// Static hosts serve out/404.html for unknown paths. Next's built-in page styles
// itself inline, which the strict CSP blocks, so this one uses the token classes.
export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 font-display text-heading font-semibold">Page not found</h1>
      <p className="text-text-secondary">
        The gallery lives on one page; filters and the open photo are in its URL.{" "}
        <Link href="/" className="text-accent-tertiary hover:underline">
          Back to the gallery
        </Link>
      </p>
    </main>
  );
}
