import Link from "next/link";

/**
 * The footer, on content pages only.
 *
 * ── Why it is not in the root layout ─────────────────────────────────────
 *
 * The shell is `h-dvh` with `overflow-hidden`, and the R3F canvas sizes to
 * 100% of a parent whose height must be definite. A footer as a sibling of
 * `<main>` takes real height off every route, including `/play` and `/race`
 * — so a link nobody reads during a session would come out of the frame the
 * game is drawn in. It goes on the pages that scroll and have prose instead.
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 *
 * An AdSense review looks for a reachable privacy policy, and "reachable"
 * means linked from the pages a reviewer lands on, not merely present at a
 * URL somebody would have to guess.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-color)] pt-6">
      <span className="hud-label">© {new Date().getFullYear()} Blockworld</span>
      <Link href="/privacy" className="hud-label text-dim hover:text-accent">
        Privacy
      </Link>
      <Link href="/browse" className="hud-label text-dim hover:text-accent">
        Browse worlds
      </Link>
    </footer>
  );
}
