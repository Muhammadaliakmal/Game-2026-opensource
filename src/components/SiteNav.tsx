"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { CurrencyRail } from "@/components/hud/CurrencyRail";
import { DiscordLink } from "@/components/DiscordLink";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The site header's right-hand side, in two layouts.
 *
 * ── The bug ──────────────────────────────────────────────────────────────
 *
 * There was one layout, and it was the desktop one. Six items — wordmark,
 * Home, Browse, Get the app, Sign in, Sign up — laid out in a row with a 12px
 * gap comes to roughly 420px of content, and a phone is 360. The right end of
 * the row simply left the screen: Sign up was cut in half, Sign in was on its
 * way out, and because the row was still *there* it pushed the document wider
 * than the viewport and gave the whole site a horizontal scrollbar. Every page
 * inherited it, because the header is in the root layout.
 *
 * Hiding items was the wrong fix and had already been tried twice — the
 * comments it left behind ("Reachable on a phone too: this used to be
 * `hidden sm:inline-flex`, which left mobile visitors with no route to the
 * gallery at all") are the record of it. Squeezing a desktop row until things
 * fall off the end does not produce a mobile layout; it produces a desktop
 * layout with holes in it.
 *
 * ── The two layouts ──────────────────────────────────────────────────────
 *
 * Below `lg` the destinations collapse behind one button, which is the
 * convention every site on a phone uses and therefore the one nobody has to
 * learn. Above it, the row is what it always was.
 *
 * `lg` (1024px), not `sm`. The row is eight destinations, the theme switch
 * and two account buttons — about 1,050px at full size — and from `sm` it
 * ran off the right edge of every tablet and every phone held sideways: at
 * 844px "Sign in" was cut in half. From 1024 the wordmark (which truncates)
 * absorbs the last few pixels. The phone's tab bar follows the same switch.
 *
 * `UserButton` stays outside the menu in both. It is the only item that is a
 * *state* rather than a destination — it says who you are signed in as — and
 * a signed-in visitor should not have to open a menu to find that out. It is
 * also a 28px avatar, which makes it the one thing here that costs nothing to
 * leave in.
 *
 * ── Why the links are a list and not markup written twice ────────────────
 *
 * Both layouts render from `LINKS`, so a destination cannot be added to the
 * desktop header and forgotten on the phone — which is exactly how Browse
 * came to be desktop-only once already.
 */

/**
 * The destinations, and the one that is conditional.
 *
 * `installed` on a row means "hide this once the app IS installed". Only
 * `/download` carries it, and it is the difference between a nav slot and a
 * dead end: an installed app that still offers "Get the app" spends a
 * top-level slot on a page whose entire content is "Nothing to do here". A
 * primary navigation item should never lead somewhere with nothing on it.
 *
 * Hiding rather than relabelling, because there is no second thing that page
 * does. If it grows one — release notes, a link to the store listing — it
 * comes back as its own row.
 */
/** One destination. `as const` narrows each row, so the flag needs a type. */
interface NavLink {
  href: string;
  label: string;
  /** Hidden once the app is installed. See the note above. */
  hideWhenInstalled?: boolean;
}

const LINKS: readonly NavLink[] = [
  { href: "/", label: "Home" },
  // Every game on one page. It goes second because it is what most people
  // came for, and it is what the arena and the arcade's cabinets never had:
  // a place in the header that leads to them in one press.
  { href: "/games", label: "Games" },
  { href: "/browse", label: "Browse" },
  { href: "/arcade", label: "Arcade" },
  { href: "/shop", label: "Characters" },
  { href: "/download", label: "Get the app", hideWhenInstalled: true },
];

/**
 * The home glyph. A logo is something people read rather than something they
 * press, so Home is a link of its own — this is what marks it at a glance in
 * a row of word-shaped chips.
 */
function HomeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6.8 8 2l6 4.8" />
      <path d="M3.6 7.8V13a.8.8 0 0 0 .8.8h7.2a.8.8 0 0 0 .8-.8V7.8" />
      <path d="M6.4 13.8V9.6h3.2v4.2" />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);

  /*
   * Read through the same hook `/download` uses, so the nav and the page can
   * never disagree about whether the app is installed.
   *
   * It is a live media query rather than a one-time sample — an installed app
   * can be launched either way — and it renders `false` on the server, so the
   * link is present in the HTML and removed on hydration for the small number
   * of visitors who are running it standalone. That is the right way round:
   * the server cannot know, and shipping the link and withdrawing it costs one
   * chip's worth of layout on a screen that is about to be a full-screen app.
   */
  const { installed } = useInstallPrompt();
  const links = LINKS.filter((l) => !(installed && l.hideWhenInstalled));

  /*
   * Open state, stored as WHERE it was opened rather than as a boolean.
   *
   * A menu that survives the navigation it triggered is a menu covering the
   * page you just asked for, so it has to close on every route change — and
   * the obvious way to write that, `useEffect(() => setOpen(false),
   * [pathname])`, is the exact pattern `react-hooks/set-state-in-effect`
   * rejects (see CLAUDE.md). It is also a render too late: the new page paints
   * with the menu still over it, and only then does the effect close it.
   *
   * Holding the path instead makes "closed" a derivation rather than an
   * action. Navigate anywhere and `openAt` no longer equals `pathname`, so the
   * menu is already shut in the same render that shows the new page — and it
   * closes for a link followed by keyboard, by a browser Back, or by anything
   * else that moves the route, none of which a per-link onClick would catch.
   */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);

  // Escape closes, and a press anywhere outside closes. Both are bound only
  // while the menu is open, so the site pays nothing for them the rest of the
  // time. `pointerdown` rather than `click`, in the capture phase: a press on
  // a page element that stops propagation should still dismiss the menu
  // rather than leave it orphaned over the content.
  useEffect(() => {
    if (!open) return;
    // `setOpenAt(null)` rather than the `setOpen` helper above: a state setter
    // from useState is stable for the life of the component, while the helper
    // is a new function every render — depending on it would tear these
    // listeners down and rebuild them on each render for no reason. Both
    // paths here only ever close, so the direct setter says all they need.
    const close = () => setOpenAt(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  return (
    <div ref={panel} className="flex min-w-0 items-center gap-2 lg:gap-3">
      {/* ── Desktop: the row ── */}
      <div className="hidden items-center gap-3 lg:flex">
        {/* Rendered from LINKS, like the menu below it. This row used to be
            written out by hand beside a comment claiming both came from the
            list — which is how a fourth destination would have been added to
            one layout and forgotten in the other, the same way Browse went
            desktop-only once already. */}
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="hud-chip"
            aria-label={l.href === "/" ? "Home" : undefined}
            aria-current={pathname === l.href ? "page" : undefined}
          >
            {l.href === "/" && <HomeIcon />}
            <span>{l.label}</span>
          </Link>
        ))}
        {/* Last in the row, right of "Get the app", and the only external
            destination the header has. See components/DiscordLink for why it
            loses its label below 1024px and disappears entirely below `sm`. */}
        <DiscordLink />
        <ThemeToggle />
        <Show when="signed-out">
          {/* Modal, not a page: UI spec §3.5 — signing in must not take
              someone away from the world they are in the middle of building.
              Styled children rather than Clerk's default buttons, so the
              header has exactly one primary action and the rest read as
              chrome. */}
          <SignInButton mode="modal">
            <button type="button" className="hud-chip">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button type="button" className="hud-chip hud-chip--primary">
              Sign up
            </button>
          </SignUpButton>
        </Show>
      </div>

      {/* ── Mobile: identity stays out, destinations go in ── */}
      {/* The wallet sits beside the avatar in both layouts, because both are
          answers to "who am I here" rather than places to go — and a balance
          you have to open a menu to see is a balance nobody sees. It hides
          itself on a narrow screen; see the component. */}
      <CurrencyRail />
      <Show when="signed-in">
        {/* Clerk's own "Delete account" removes the sign-in only; this is the
            path that removes the data too. Play requires it reachable from
            inside the app, and this menu is on every screen. */}
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Link
              label="Delete account"
              href="/account/delete"
              labelIcon={<span aria-hidden="true">✕</span>}
            />
          </UserButton.MenuItems>
        </UserButton>
      </Show>

      {/* The wrapper is what hides it. `sm:hidden` on the button itself
          never worked: `.hud-chip` sets `display` in unlayered CSS, which
          beats every Tailwind utility, so the menu button sat beside the
          full desktop row on every page. */}
      <div className="contents lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className={`hud-chip hud-chip--icon hud-chip--touch ${open ? "is-active" : ""}`}
        >
          {/* Drawn rather than a glyph character, so the bars carry the same
            stroke weight as the home icon and the two read as one family. */}
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <>
                <path d="M3.5 3.5l9 9" />
                <path d="M12.5 3.5l-9 9" />
              </>
            ) : (
              <>
                <path d="M2.5 4.5h11" />
                <path d="M2.5 8h11" />
                <path d="M2.5 11.5h11" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div
          id="site-menu"
          // Anchored to the header (which is `relative`) rather than to this
          // flex item, so the panel spans the screen instead of the width of a
          // 28px button. The small horizontal inset keeps it clear of a
          // phone's rounded corners.
          className="hud-panel panel-enter absolute inset-x-2 top-full z-50 mt-1 flex flex-col gap-0.5 p-1.5 lg:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hud-menu-item ${
                pathname === l.href ? "is-active" : ""
              }`}
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.href === "/" && <HomeIcon />}
              {l.label}
            </Link>
          ))}

          {/* With its name here, unlike the row: this panel has the width for
              it, and a lone glyph in a list of words is the one place an
              icon-only item genuinely is unreadable. */}
          <DiscordLink variant="menu" />

          <span className="hud-menu-sep" />
          <ThemeToggle variant="menu" />

          <Show when="signed-out">
            <span className="hud-menu-sep" />
            <SignInButton mode="modal">
              <button type="button" className="hud-menu-item">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="hud-menu-item text-accent font-semibold"
              >
                Sign up
              </button>
            </SignUpButton>
          </Show>
        </div>
      )}
    </div>
  );
}

/**
 * The phone's tab bar: the five places people go, under the thumb.
 *
 * Below `sm` the header's destinations sit behind a menu button in the top
 * corner, which is the one corner of a phone a thumb cannot reach. The menu
 * stays — it is still where signing in, the theme, Discord and "Get the app"
 * live — but the destinations people move between all session are here too,
 * one press away, where every app they have used puts them.
 *
 * Built from `LINKS` by href, so a renamed destination renames its tab. A
 * flex child of the root layout's shell rather than `position: fixed`, so it
 * takes its own height instead of lying over the end of every page; the body
 * already pads for the home indicator, so it sits above it for free. Hidden
 * on every game screen by the same `:has([data-immersive])` rule as the
 * header (globals.css).
 */
const TABS: readonly { href: string; icon: React.ReactNode }[] = [
  { href: "/", icon: <path d="M2.5 7.5L8 3l5.5 4.5V13H10V9.5H6V13H2.5z" /> },
  {
    href: "/games",
    icon: (
      <path d="M3 5.5h10a1.5 1.5 0 011.5 1.5v3A2.5 2.5 0 0110 11.5H6A2.5 2.5 0 011.5 10V7A1.5 1.5 0 013 5.5zM5 7.5v2M4 8.5h2M10.5 8h.01M12 9.5h.01" />
    ),
  },
  {
    href: "/arcade",
    icon: (
      <path d="M4 14V3.5A1.5 1.5 0 015.5 2h5A1.5 1.5 0 0112 3.5V14M5.5 4h5v4h-5zM6 11h.01M10 11h.01" />
    ),
  },
  {
    href: "/browse",
    icon: (
      <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
    ),
  },
  {
    href: "/shop",
    icon: (
      <path d="M8 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 14c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" />
    ),
  },
];

export function SiteTabBar() {
  const pathname = usePathname();
  const label = (href: string) =>
    LINKS.find((l) => l.href === href)?.label ?? href;
  const current = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="site-tabbar bg-surface flex shrink-0 border-t border-[var(--border-color)] lg:hidden"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={current(t.href) ? "page" : undefined}
          className="site-tab"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {t.icon}
          </svg>
          <span>{label(t.href)}</span>
        </Link>
      ))}
    </nav>
  );
}
