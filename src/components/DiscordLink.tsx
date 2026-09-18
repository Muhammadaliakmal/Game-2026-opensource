import { DISCORD_PATH } from "@/lib/discord";

/**
 * The Discord glyph, drawn rather than fetched.
 *
 * Every other icon on this site is an inline SVG in the same 16-unit box, and
 * a brand mark pulled from a CDN would be the one icon that can fail to load,
 * the one that costs a request, and the one that does not inherit
 * `currentColor`.
 *
 * Filled rather than stroked, unlike the rest, because that is the shape
 * people recognise — a 1.6px outline of it reads as a smudge at 14px.
 */
export function DiscordIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13.2 3.4a11 11 0 0 0-2.8-.9l-.2.4a8.2 8.2 0 0 1 2.4 1.2 11.6 11.6 0 0 0-3.4-.6 11.6 11.6 0 0 0-3.4.6 8.2 8.2 0 0 1 2.4-1.2l-.2-.4a11 11 0 0 0-2.8.9C2.9 5.9 2.3 8.4 2.5 10.8a11.3 11.3 0 0 0 3.4 1.8l.7-1.1c-.4-.1-.8-.3-1.2-.6l.3-.2a7.8 7.8 0 0 0 6.7 0l.3.2c-.4.3-.8.5-1.2.6l.7 1.1a11.3 11.3 0 0 0 3.4-1.8c.3-2.8-.5-5.3-2.4-7.4ZM6.2 9.5c-.7 0-1.2-.6-1.2-1.4s.5-1.4 1.2-1.4 1.2.6 1.2 1.4-.5 1.4-1.2 1.4Zm3.6 0c-.7 0-1.2-.6-1.2-1.4s.5-1.4 1.2-1.4 1.2.6 1.2 1.4-.5 1.4-1.2 1.4Z" />
    </svg>
  );
}

/**
 * The header's Discord item, last in the row.
 *
 * ── Why the label only appears at 1024px ─────────────────────────────────
 *
 * The header's whole layout is a width budget — `SiteNav` carries the full
 * account of how the row once ran off the side of a phone. Between `sm` and
 * `lg` the row is already six chips wide; adding a seventh with a word in it
 * is how that regression happens again. The glyph is recognisable on its own,
 * which is the one thing that makes icon-only defensible here and does not
 * make it defensible for "Browse".
 *
 * ── And why it is not visible below `sm` ─────────────────────────────────
 *
 * The spec asks for icon-only on mobile. Below `sm` this header has exactly
 * one rule, and it is documented as the fix for a real bug: destinations
 * collapse behind one button, identity stays out. An external link pinned
 * beside the avatar would be the seventh thing in a row built for two, and
 * "hiding items was the wrong fix and had already been tried twice" is a
 * comment in that file about this exact temptation. It appears in the menu
 * instead, with its name, which is where every other destination is.
 *
 * ── `target` and `rel` ───────────────────────────────────────────────────
 *
 * A new tab, because the game may be mid-run in this one. `noopener` is the
 * security half and is not optional on a `target="_blank"`: without it the
 * opened page gets a handle on this one through `window.opener`.
 */
export function DiscordLink({
  variant = "row",
}: {
  /** "row" for the desktop header, "menu" for the mobile panel. */
  variant?: "row" | "menu";
}) {
  const label = "Join our Discord";

  if (variant === "menu") {
    return (
      <a
        href={DISCORD_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="hud-menu-item"
      >
        <DiscordIcon />
        Discord
      </a>
    );
  }

  return (
    <a
      href={DISCORD_PATH}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="hud-chip"
    >
      <DiscordIcon />
      {/* Present in the DOM from `lg` up. Hidden with a class rather than
          branched on a media-query hook, so the server and the client render
          the same markup and there is nothing to hydrate differently. */}
      <span className="hidden lg:inline">Discord</span>
    </a>
  );
}
