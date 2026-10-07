"use client";

import { useEffect, useState } from "react";
import { offerReward, type RewardOffer } from "@/lib/game-ads";
import { useArcade } from "../store";

/**
 * "Watch an ad · continue" on the death screen, for a cabinet that can resume
 * (`ArcadeGame.revive`), once per run, and only when Google has an ad to show.
 *
 * Same rule as `RewardedDouble`: no ad, no button — the offer exists only for
 * as long as `beforeReward` says it does. The overlay mounts this *instead* of
 * the double on a run that can still continue, because two rewarded
 * placements asked for at once is one Google will decline, and a second
 * chance is worth more to a player than a few coins.
 *
 * The continue itself is the store's `revive`: the host sees the tick, calls
 * the cabinet's `revive`, and the run picks up where it stopped — same score,
 * same board — paying only for what it adds from here.
 */
export function RewardedContinue() {
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let live = true;
    offerReward({
      name: "arcade-continue",
      onOffer: (o) => {
        if (live) setOffer(o);
      },
      onReward: () => {
        if (live) useArcade.getState().revive();
      },
      onDone: () => {
        if (!live) return;
        setOffer(null);
        setWatching(false);
      },
    });
    return () => {
      live = false;
    };
  }, []);

  if (!offer) return null;

  return (
    <button
      type="button"
      className="hud-chip hud-chip--primary hud-chip--touch panel-enter"
      disabled={watching}
      onClick={() => {
        setWatching(true);
        offer.show();
      }}
    >
      <span aria-hidden>▶</span> Watch an ad · continue from here
    </button>
  );
}
