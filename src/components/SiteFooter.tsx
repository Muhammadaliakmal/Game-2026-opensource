import Link from "next/link";
import { footerLinks } from "@/lib/site-links";
import { OWNER_NAME, SITE_NAME } from "@/lib/site";
import { DISCORD_PATH } from "@/lib/discord";
import { DiscordIcon } from "@/components/DiscordLink";
import { SiteTotals } from "@/components/stats/SiteTotals";

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
      {/*
        The Discord block, above the link row.

        ── Why a block and not a sixth link ───────────────────────────────

        The row below it is compliance furniture — About, Contact, Privacy,
        Terms — read by an ad reviewer and almost nobody else. A community
        invite dropped into it inherits that: five grey words, one of which
        happens to be somewhere people are. It gets its own bordered box, one
        sentence and a real button, and it is the only thing in this footer
        that is trying to be pressed.

        It is still the footer rather than a modal or a corner popup. The
        spec is explicit — "the site's whole appeal is that it starts
        instantly" — and nothing here interrupts that.
      */}
      <section className="mb-4 flex flex-col items-start gap-2 rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--color-panel)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-ink text-sm font-semibold">Players are in Discord</h2>
          <p className="text-dim text-xs">
            Track records, run nights, and whatever gets built next.
          </p>
        </div>
        <a
          href={DISCORD_PATH}
          target="_blank"
          rel="noopener noreferrer"
          /* Blurple, stated inline rather than tokenised. It is Discord's
             colour and it deliberately does not follow `--color-accent` —
             this is the one control on the site that is somebody else's
             brand, and a green one would read as ours. */
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
          style={{ background: "#5865F2" }}
        >
          <DiscordIcon className="h-4 w-4" />
          Join the Discord
        </a>
      </section>

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* The name is the point of the line, not the year: a review is looking
            for a publisher, and "© 2026 Spec Driven Games" names a product rather than
            a person. */}
        <span className="hud-label">
          © {new Date().getFullYear()} {SITE_NAME} — {OWNER_NAME}
        </span>
        {/* Social proof, and absent entirely until there is some. See the
            component — a footer reading "0 plays" is worse than a footer that
            does not mention it. */}
        <SiteTotals />
      </div>
    </footer>
  );
}
