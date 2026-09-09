import { ArcadeLobby } from "@/components/arcade/ArcadeLobby";
import { PageShell, PageHeader } from "@/components/PageShell";
import { DAILY_HARD_CAP, DAILY_SOFT_CAP } from "@/lib/arcade-payout";

/**
 * The arcade.
 *
 * Static, like `/parkour` and for the same reason: everything on it comes from
 * code. The cabinet list is a constant, the payout rates are constants, and the
 * one per-player fact on the screen — your best score — lives in the browser
 * and is read by the client component below rather than fetched.
 */
export const metadata = {
  title: "Arcade — Blockworld",
  description: "Four cabinets, ninety seconds a go. Coins for the shop.",
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

      <ArcadeLobby />

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
