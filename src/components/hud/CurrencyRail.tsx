"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useShop } from "@/lib/shop";

/**
 * Who you are and what you have, on every screen that is not a world.
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 *
 * The app had no persistent player identity anywhere outside the shop. You
 * could play four cabinets, finish six courses and earn several hundred coins
 * without ever seeing a coin total unless you deliberately navigated to
 * `/shop` — so the currency the arcade exists to pay was invisible in the
 * places it was being paid.
 *
 * That is the retention loop broken at its most important joint. A reward is
 * only a reward if you can see it accumulating; a number that only exists on
 * the page where you spend it is a price list, not a balance.
 *
 * ── Why it is not on game screens ────────────────────────────────────────
 *
 * `body:has([data-immersive])` hides the site header on every world (see
 * globals.css), and this lives in that header deliberately. A HUD is for the
 * three things you read while playing; a wallet is not one of them, and a
 * coin counter over a race is exactly the free-to-play chrome this game's
 * direction is trying not to be.
 *
 * ── Why it loads through `ensureLoaded` ──────────────────────────────────
 *
 * The store already has one-load-per-page semantics for the avatar, which
 * needs the equipped character on every world mount. Reusing it means mounting
 * this in the header costs at most one request per page life and usually zero,
 * because the avatar has already asked.
 *
 * ── Signed out ───────────────────────────────────────────────────────────
 *
 * Renders nothing. A "0 coins" chip beside a Sign in button is an invitation
 * to notice you have nothing, and there is no wallet to speak of until there
 * is an account to hold one.
 */
export function CurrencyRail() {
  const coins = useShop((s) => s.coins);
  const signedIn = useShop((s) => s.signedIn);
  const loaded = useShop((s) => s.loaded);
  const ensureLoaded = useShop((s) => s.ensureLoaded);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  // Nothing at all until the server has answered once. The alternative is a
  // chip that says 0 and then jumps to 1,194, which reads as coins being spent
  // rather than as a value arriving.
  if (!loaded || !signedIn) return null;

  return (
    <Link
      href="/shop"
      // The whole strip is the link, for the same reason the mode tiles are:
      // a balance you can see and not press is a dead end, and the place a
      // player wants to go from "I have coins" is "what do they buy".
      className="hud-chip hud-chip--touch chamfer-sm hidden items-center gap-2 sm:inline-flex"
      aria-label={`${coins.toLocaleString()} coins. Open characters.`}
    >
      {/* The coin, from the UI art set (`npm run ui:art`), and the only
          icon here. There used to be a rotated square in the equipped
          character's accent beside it; next to the coin and the cyan logo
          diamond it read as a second currency, so it went. A background
          rather than an <img>: it is decoration, the number beside it is the
          content, and the label above already says coins. */}
      <span
        aria-hidden
        className="block h-[18px] w-[18px] shrink-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/ui/coin.webp)" }}
      />
      <span className="num text-ink font-semibold">
        {coins.toLocaleString()}
      </span>
      <span className="hud-label">coins</span>
    </Link>
  );
}
