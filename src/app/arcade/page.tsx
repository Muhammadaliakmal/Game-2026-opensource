import { Suspense } from "react";
import { ArcadeLobby, ArcadeLobbySkeleton } from "@/components/arcade/ArcadeLobby";
import { ArcadeAutoOpen } from "@/components/arcade/ArcadeAutoOpen";
import { PageShell, PageHeader } from "@/components/PageShell";
import { DAILY_HARD_CAP, DAILY_SOFT_CAP } from "@/lib/arcade-payout";
import { CABINET_COUNT } from "@/content/registry";

/**
 * The arcade.
 *
 * Static, like `/parkour` and for the same reason: everything on it comes from
 * code. The cabinet list is a constant, the payout rates are constants, and the
 * one per-player fact on the screen — your best score — lives in the browser
 * and is read by the client component below rather than fetched.
 */
export const metadata = {
  title: "Arcade — Spec Driven Games",
  description: `${CABINET_COUNT} cabinets, a few minutes a go. Coins for the shop.`,
};

export default function ArcadePage() {
  return (
    <PageShell>
      <PageHeader title="Arcade">
        <p className="text-dim max-w-xl text-sm">
          Short games, played on a flat screen over the world. A run takes under
          two minutes and every one of them pays something — the coins are the
          same coins the courses pay, and they buy the same characters.
        </p>
      </PageHeader>

      {/*
        `useSearchParams` needs a Suspense boundary or the whole static page
        falls back to client rendering. The lobby now reads `?sort=` and
        `?tags=` as well, so it is inside one too.

        Its fallback is a card-shaped skeleton rather than nothing. The
        cabinets' art is `<CabinetPreview>`, a canvas that only ever exists in
        the browser, so the grid was never meaningfully in the server HTML to
        begin with — but the SPACE it occupies has to be, or the page paints
        short and everything under it jumps down when the grid arrives. That
        jump is a layout shift, and on this site a layout shift is an AdSense
        question as well as a polish one.

        `ArcadeAutoOpen` renders nothing either way, so its fallback is
        nothing.
      */}
      <Suspense fallback={<ArcadeLobbySkeleton />}>
        <ArcadeLobby />
      </Suspense>
      <Suspense fallback={null}>
        <ArcadeAutoOpen />
      </Suspense>

      {/* The payout rule, said once and plainly. A cap a player discovers by
          watching their coins stop is a cap that reads as a bug. */}
      <section className="mt-10">
        <h2 className="hud-label mb-3">Coins</h2>
        <p className="text-dim max-w-2xl text-xs">
          A run pays its score times the cabinet&apos;s rate. The first{" "}
          <span className="num">{DAILY_SOFT_CAP}</span> coins a day come at full
          rate and everything after that at a fifth, up to{" "}
          <span className="num">{DAILY_HARD_CAP}</span> a day. Scores and best
          runs keep counting after that — only the payout stops.
        </p>
      </section>
    </PageShell>
  );
}
