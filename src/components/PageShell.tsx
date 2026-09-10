import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * The one page container. Every non-immersive route renders inside it.
 *
 * ── The bug ──────────────────────────────────────────────────────────────
 *
 * There were two shells, written independently and never compared:
 *
 *   home / browse / arcade / parkour / shop   max-w-5xl, px-4 sm:px-6
 *   race / arena / download                   max-w-2xl, px-4 sm:px-8
 *
 * Both centre their container, so on a wide screen the narrow pages' content
 * starts about 106px further right than the wide ones'. Navigating from Arcade
 * to Get the app therefore slides the "← BLOCKWORLD" link and the page heading
 * sideways — the same two elements, in the same role, at the same place in the
 * layout, at two different x positions. Nothing is broken enough to look like
 * a bug, which is why it survived: it just makes the app feel like several
 * sites that share a header.
 *
 * ── Why the fix is not "make them all max-w-5xl" ─────────────────────────
 *
 * The narrow measure is right where it is used. `/download` and `/race` are
 * mostly prose and a couple of controls, and prose set to 64rem is unreadable
 * — that is what `p { max-width: min(68ch, 100%) }` in globals.css is already
 * defending against.
 *
 * So the container is always the same width and the same padding, and `width`
 * caps the CONTENT inside it instead. The left edge is then a property of the
 * shell rather than of the page, which is the thing that was actually
 * inconsistent, and a narrow page stays narrow.
 *
 * ── Why the footer is here ───────────────────────────────────────────────
 *
 * It was on `/` and `/browse` and nowhere else, which is half of a footer: an
 * ad review looks for the policy links from whatever page it lands on, and
 * "landed on /arcade" was a page with no route to a privacy policy at all.
 * Rendering it here puts it on every route that uses the shell in one place,
 * and — the part that matters more — on every route added later without
 * anybody having to remember. The three pages with bespoke containers ask for
 * it themselves.
 *
 * Not in the root layout, for the reason `SiteFooter` documents: the immersive
 * routes are a definite-height canvas, and a footer there comes out of the
 * frame the game is drawn in.
 *
 * ── Why it is a Server Component ─────────────────────────────────────────
 *
 * It has no state and no handlers, so making it a client component would drag
 * every page that uses it — including the ones that are pure database reads —
 * across the boundary for a `<div>`.
 */
export function PageShell({
  children,
  mode,
  /**
   * How wide the content may get.
   *
   * `wide` is a grid of cards. `prose` is text and a few controls, capped at a
   * readable measure. Both start at the same left edge.
   */
  width = "wide",
  className = "",
  footer = true,
}: {
  children: ReactNode;
  /**
   * Rebinds `--color-accent` for the whole page, exactly as the in-game HUDs
   * do — see the `[data-mode]` rules in globals.css.
   *
   * On the shell rather than on each page's own wrapper because it is a
   * property of the screen, and a page that had to remember to set it is a
   * page that will one day forget: `/parkour` is green and `/race` is magenta,
   * and the pages that lead to them should be too.
   */
  mode?: "build" | "race" | "parkour" | "arena";
  width?: "wide" | "prose";
  className?: string;
  /**
   * Off only for a page that is not public content — the dev kit, and
   * anything else a reader is never sent to.
   */
  footer?: boolean;
}) {
  return (
    <div
      data-mode={mode}
      className={`mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8 ${className}`}
    >
      {/* `max-w-2xl` here rather than on the container above: capping the
          content leaves the container — and therefore the left edge — where
          every other route puts it. Capping the container moves the whole
          page. That difference is the entire bug. */}
      <div className={width === "prose" ? "flex max-w-2xl flex-col gap-8" : ""}>
        {children}
        {footer && <SiteFooter />}
      </div>
    </div>
  );
}

/**
 * The page's own title block: a route back, a heading, and an optional
 * standfirst.
 *
 * Hoisted here because it was written five times with four different
 * spellings — `text-2xl font-semibold` on one page and `text-display font-bold`
 * on the next, for the same element in the same position. A heading that
 * changes size when you navigate is the same class of defect as one that
 * changes position.
 */
export function PageHeader({
  title,
  children,
  back = { href: "/", label: "← Blockworld" },
}: {
  title: string;
  /** The standfirst, and anything else that belongs above the fold. */
  children?: ReactNode;
  back?: { href: string; label: string } | null;
}) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      {back && (
        // Not a <Link> import here: the shell is a Server Component and this
        // is one anchor. Next's client-side navigation is a nicety on a link
        // that leaves the current screen entirely.
        <a href={back.href} className="hud-label w-fit">
          {back.label}
        </a>
      )}
      <h1 className="text-display font-bold">{title}</h1>
      {children}
    </header>
  );
}
