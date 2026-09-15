import type { MatchResult } from "@/lib/match-reward";
import { SERVICE_SECRET_HEADER } from "@/lib/service-auth";

/**
 * Where a match result is turned into coins — which is not here.
 *
 * The room knows the result; the app owns the wallet. So the room reports
 * the result to `POST /api/rewards/match` with the same service secret it
 * saves worlds with, and the app applies the rule (`lib/match-reward.ts`)
 * and the day's ceiling. The room never states an amount: a room that could
 * say "pay this user 60" is a room that, compromised, could say 6,000.
 *
 * The same shape as `WorldSource` and for the same reasons: an interface so
 * a room can be tested against one held in memory, and a module-level
 * instance set once at startup rather than anything a joining client could
 * name.
 *
 * ── Failure is logged and dropped ────────────────────────────────────────
 *
 * A payout that could not be made is a cosmetic that did not arrive. The
 * race is over, the result stood, and nothing about the room should stall
 * on the app being slow — so the call is fire-and-forget from the room's
 * point of view, and a rejection is a line in the log.
 */

export interface RewardSink {
  /** Resolves to what was paid, or null when nothing could be. */
  pay(result: MatchResult & { userId: string }): Promise<{ earned: number; coins: number } | null>;
}

let current: RewardSink = { pay: async () => null };

export function setRewardSink(sink: RewardSink) {
  current = sink;
}

export function getRewardSink(): RewardSink {
  return current;
}

/** For tests: remembers every result it was handed and pays a fixed amount. */
export function memoryRewardSink(earned = 1): RewardSink & { paid: Array<MatchResult & { userId: string }> } {
  const paid: Array<MatchResult & { userId: string }> = [];
  return {
    paid,
    async pay(result) {
      paid.push(result);
      return { earned, coins: earned * paid.length };
    },
  };
}

/**
 * Pays through the app. Without a secret it pays nobody — there is no public
 * route that would, and a room running against `next dev` with no secret is
 * simply a room in which matches are free.
 */
export function appRewardSink(baseUrl: string, secret?: string): RewardSink {
  if (!secret) return { pay: async () => null };
  const url = `${baseUrl}/api/rewards/match`;
  return {
    async pay(result) {
      const res = await fetch(url, {
        method: "POST",
        headers: { [SERVICE_SECRET_HEADER]: secret, "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error(`reward failed: ${res.status}`);
      const body = (await res.json()) as { earned?: number; coins?: number | null };
      if (typeof body.earned !== "number" || typeof body.coins !== "number") return null;
      return { earned: body.earned, coins: body.coins };
    },
  };
}
