"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

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
 * Below `sm` the destinations collapse behind one button, which is the
 * convention every site on a phone uses and therefore the one nobody has to
 * learn. Above it, the row is what it always was.
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

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/download", label: "Get the app" },
] as const;

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
    <div ref={panel} className="flex min-w-0 items-center gap-2 sm:gap-3">
      {/* ── Desktop: the row ── */}
      <div className="hidden items-center gap-3 sm:flex">
        <Link href="/" className="hud-chip" aria-label="Home">
          <HomeIcon />
          <span>Home</span>
        </Link>
        <Link href="/browse" className="hud-chip">
          Browse
        </Link>
        <Link href="/download" className="hud-chip">
          Get the app
        </Link>
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
      <Show when="signed-in">
        <UserButton />
      </Show>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className={`hud-chip hud-chip--icon hud-chip--touch sm:hidden ${
          open ? "is-active" : ""
        }`}
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

      {open && (
        <div
          id="site-menu"
          // Anchored to the header (which is `relative`) rather than to this
          // flex item, so the panel spans the screen instead of the width of a
          // 28px button. The small horizontal inset keeps it clear of a
          // phone's rounded corners.
          className="hud-panel panel-enter absolute inset-x-2 top-full z-50 mt-1 flex flex-col gap-0.5 p-1.5 sm:hidden"
        >
          {LINKS.map((l) => (
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
