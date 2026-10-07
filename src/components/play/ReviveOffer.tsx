"use client";

import { useEffect, useRef, useState } from "react";
import { offerReward, type RewardOffer } from "@/lib/game-ads";
import { requestTeleport, useReviveOffer } from "./revive";

/** How long the offer stays up after a death before it lets the run go on. */
const OFFER_MS = 8000;

/**
 * The chip that offers a fallen runner their spot back for one rewarded ad.
 *
 * One ask to Google per death, keyed on the offer's id. No ad, no chip — the
 * rule every rewarded placement here follows. It takes itself down after
 * eight seconds: past that the player has started climbing again and a button
 * that would yank them backwards is a trap, not an offer.
 */
export function ReviveOffer() {
  const spot = useReviveOffer((s) => s.spot);
  const id = useReviveOffer((s) => s.id);
  const [ad, setAd] = useState<{ id: number; offer: RewardOffer } | null>(null);
  const [watching, setWatching] = useState(false);
  // The take-down timer, cancelled the moment an ad starts: the chip must not
  // vanish under a player who is watching for it.
  const timer = useRef(0);

  useEffect(() => {
    if (!spot) return;
    let live = true;
    offerReward({
      name: "parkour-revive",
      onOffer: (o) => {
        if (live) setAd({ id, offer: o });
      },
      onReward: () => {
        if (!live) return;
        requestTeleport(spot);
        useReviveOffer.getState().clear();
      },
      onDone: () => {
        if (!live) return;
        setAd(null);
        setWatching(false);
      },
    });
    timer.current = window.setTimeout(() => {
      if (live) useReviveOffer.getState().clear();
    }, OFFER_MS);
    return () => {
      live = false;
      window.clearTimeout(timer.current);
    };
  }, [spot, id]);

  // Shown only for the death it was offered for.
  if (!spot || !ad || ad.id !== id) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4">
      <button
        type="button"
        className="hud-chip hud-chip--primary hud-chip--touch panel-enter pointer-events-auto"
        disabled={watching}
        onClick={() => {
          window.clearTimeout(timer.current);
          setWatching(true);
          ad.offer.show();
        }}
      >
        <span aria-hidden>▶</span> Watch an ad · back to where you fell
      </button>
    </div>
  );
}
