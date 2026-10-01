"use client";

import { useEffect, useState } from "react";
import { offerReward, type RewardOffer } from "@/lib/game-ads";
import { bonusFor } from "@/lib/game-ads-policy";
import { useArcade } from "../store";
import { today } from "../persistence";

/**
 * "Watch an ad · double it" on the results screen, and only when there is an
 * ad to watch.
 *
 * Mounted with the game-over panel and gone with it, so each run asks once.
 * Google answers through `beforeReward` if it has a rewarded ad for this
 * moment; until then — and forever, when it has none, when H5 Games Ads is
 * not switched on for the account, or when an ad blocker is in the way —
 * this renders nothing. A button that might do nothing would be worse than
 * no button.
 *
 * The amount is fixed when the offer is made, from the run's payout at that
 * moment, so the number on the button is the number paid.
 */
export function RewardedDouble({ earned, capped }: { earned: number; capped: boolean }) {
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [state, setState] = useState<"idle" | "watching" | "paid" | "failed">("idle");
  const [paid, setPaid] = useState(0);
  // State with no setter rather than a ref: read during render, and fixed
  // at mount — `creditBonus` raising `earned` must not change the offer.
  const [amount] = useState(() => (capped ? 0 : bonusFor(earned)));

  useEffect(() => {
    if (amount <= 0) return;
    let live = true;
    offerReward({
      onOffer: (o) => {
        if (live) setOffer(o);
      },
      onReward: () => {
        if (live) void claim(amount);
      },
      onDone: () => {
        if (live) setOffer(null);
      },
    });
    return () => {
      live = false;
    };

    async function claim(n: number) {
      try {
        const res = await fetch("/api/arcade/bonus", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: n, date: today() }),
        });
        const data = res.ok ? await res.json() : null;
        if (!live) return;
        if (typeof data?.earned !== "number" || data.earned <= 0) {
          setState("failed");
          return;
        }
        useArcade.getState().creditBonus(data.earned);
        useArcade.getState().setCapped(Boolean(data.cappedForToday));
        setPaid(data.earned);
        setState("paid");
        if (typeof data.coins === "number") {
          const { useShop } = await import("@/lib/shop");
          useShop.setState({ coins: data.coins });
        }
      } catch {
        if (live) setState("failed");
      }
    }
  }, [amount]);

  if (state === "paid") {
    return (
      <p className="text-accent text-sm font-semibold" role="status">
        Doubled · +{paid.toLocaleString()} coins
      </p>
    );
  }
  if (state === "failed") {
    return (
      <p className="text-dim text-xs" role="status">
        The bonus did not go through — today&apos;s arcade limit may be reached.
      </p>
    );
  }
  if (!offer) return null;

  return (
    <button
      type="button"
      className="hud-chip hud-chip--primary panel-enter"
      disabled={state === "watching"}
      onClick={() => {
        setState("watching");
        offer.show();
      }}
    >
      <span aria-hidden>▶</span> Watch an ad · double it (+{amount.toLocaleString()})
    </button>
  );
}
