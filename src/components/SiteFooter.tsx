import Link from "next/link";
import { footerLinks } from "@/lib/site-links";
import { OWNER_NAME, SITE_NAME } from "@/lib/site";

/**
 * The footer, on content pages only.
 *
 * ── Why it is not in the root layout ─────────────────────────────────────
 *
 * The shell is `h-dvh` with `overflow-hidden`, and the R3F canvas sizes to
 * 100% of a parent whose height must be definite. A footer as a sibling of
 * `<main>` takes real height off every route, including `/play` and `/race`
 * — so a link nobody reads during a session would come out of the frame the
 * game is drawn in. It goes on the pages that scroll and have prose instead,
 * which now means `PageShell` renders it and the three bespoke pages ask for
 * it themselves.
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 *
 * An ad review looks for a publisher: someone identifiable, contactable, with
 * stated terms and a privacy policy. It looks for them in the footer, and
 * "reachable" means linked from the pages a reviewer lands on rather than
 * merely present at a URL somebody would have to guess. Five links in one
 * row is the whole of that requirement.
 *
 * ── The blog link is conditional, and deliberately so ────────────────────
 *
 * `hasPosts()` is false until a real post is written, and a footer link to an
 * empty blog is worse than no link at all: a thin page reached from every
 * page on the site is the exact shape of the "Low Value Content" rejection.
 * The sitemap and the About page ask the same question, so the blog appears
 * everywhere at once or nowhere at all.
 */

export function SiteFooter() {
  return (
    <footer className="mt-12 flex flex-col gap-2 border-t border-[var(--border-color)] pt-6">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {footerLinks().map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hud-label text-dim hover:text-accent"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {/* The name is the point of the line, not the year: a review is looking
          for a publisher, and "© 2026 Spec Driven Games" names a product rather than
          a person. */}
      <span className="hud-label">
        © {new Date().getFullYear()} {SITE_NAME} — {OWNER_NAME}
      </span>
    </footer>
  );
}
