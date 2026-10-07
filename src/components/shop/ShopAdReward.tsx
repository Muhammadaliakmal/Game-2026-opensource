"use client";

import { useEffect, useState } from "react";
import { offerReward, type RewardOffer } from "@/lib/game-ads";
import { SHOP_AD_COINS } from "@/lib/game-ads-policy";
import { today } from "@/arcade/persistence";
import { useShop } from "@/lib/shop";
import { CoinIcon } from "@/components/hud/CoinIcon";

/**
 * "Watch an ad · +100 coins", in the shop, as many times as Google will offer.
 *
 * A character costs thousands and a course pays hundreds, so this is the
 * short cut for somebody who would rather watch than grind. It is paid
 * through `/api/arcade/bonus` — the arcade's daily pool, clamped in SQL — so
 * "everything that is not a course pays at most 1,000 a day" stays one
 * sentence, and a forged claim buys nothing the arcade's own route would not.
 *
 * Same rule as every rewarded placement here: the button exists only while
 * Google has an ad to show (`beforeReward`). After each one the next offer is
 * asked for, so a player can watch several in a row while Google keeps
 * offering. With no ad — H5 Games Ads off, an ad blocker, the WebView build —
 * the panel says so quietly instead of showing a button that does nothing.
 */
export function ShopAdReward() {
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [state, setState] = useState<"waiting" | "watching" | "paid" | "capped">("waiting");
  const [round, setRound] = useState(0);
  const [paidToday, setPaidToday] = useState(0);

  useEffect(() => {
    let live = true;
    offerReward({
      name: "shop-coins",
      onOffer: (o) => {
        if (live) setOffer(o);
      },
      onReward: () => {
        if (live) void claim();
      },
      onDone: () => {
        if (!live) return;
        setOffer(null);
        // Ask again for the next one, after a beat so Google's own pacing has
        // a chance to answer rather than a tight loop of refusals.
        window.setTimeout(() => live && setRound((r) => r + 1), 4000);
      },
    });
    return () => {
      live = false;
    };

    async function claim() {
      try {
        const res = await fetch("/api/arcade/bonus", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: SHOP_AD_COINS, date: today() }),
        });
        const data = res.ok ? await res.json() : null;
        if (!live) return;
        if (typeof data?.earned !== "number" || data.earned <= 0) {
          setState("capped");
          return;
        }
        setPaidToday((n) => n + data.earned);
        setState(data.cappedForToday ? "capped" : "paid");
        if (typeof data.coins === "number") useShop.setState({ coins: data.coins });
      } catch {
        if (live) setState("waiting");
      }
    }
  }, [round]);

  return (
    <div className="hud-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="hud-label">Free coins</span>
        <span className="text-dim text-sm">
          {state === "capped"
            ? "That is today's limit. More tomorrow."
            : paidToday > 0
              ? `+${paidToday.toLocaleString()} coins from ads today. Keep going?`
              : `Watch a short ad for ${SHOP_AD_COINS} coins toward a character.`}
        </span>
      </div>
      {state !== "capped" &&
        (offer ? (
          <button
            type="button"
            className="hud-chip hud-chip--primary hud-chip--touch panel-enter"
            disabled={state === "watching"}
            onClick={() => {
              setState("watching");
              offer.show();
            }}
          >
            <span aria-hidden>▶</span> Watch · +<CoinIcon size={16} /> {SHOP_AD_COINS}
          </button>
        ) : (
          <span className="hud-label text-dim">No ad ready yet</span>
        ))}
    </div>
  );
}
