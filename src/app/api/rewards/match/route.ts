import { NextResponse } from "next/server";
import { z } from "zod";
import { isRoomServer } from "@/lib/service-auth";
import { awardMatchCoins } from "@/lib/db/players";
import { MAX_MATCH_REWARD, matchReward } from "@/lib/match-reward";
import { dayKey } from "@/lib/daily";

/**
 * POST /api/rewards/match — pay a race place or a duel result.
 *
 * ── Only the room may call this ──────────────────────────────────────────
 *
 * A match result is a fact the room server established: it ran the lap
 * counter, it counted the knockdowns, and it alone knows how many people
 * were on the grid. The client is never asked, and this route is invisible
 * without the service secret — the same gate as `/api/worlds/:id/sync`, for
 * the same reason. A 404 rather than a 401, so the route's existence is not
 * confirmed to anybody guessing at it.
 *
 * ── The room sends the result, not the amount ────────────────────────────
 *
 * `lib/match-reward.ts` turns a result into coins on this side. The room
 * could compute it — it imports the same module — but a route that accepts
 * "pay this user 60" is one leaked secret from paying anyone anything,
 * while one that accepts "this user came second of four" is bounded by the
 * rule whatever is sent. `MAX_MATCH_REWARD` is asserted on the way out as a
 * second line for the same reason.
 *
 * Guests have no wallet and are never sent here; the room checks first.
 */

const result = z.object({
  userId: z.string().min(1).max(64),
  mode: z.enum(["race", "arena"]),
  entrants: z.number().int().min(1).max(8),
  place: z.number().int().min(0).max(8).optional(),
  won: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!isRoomServer(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = result.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad result" }, { status: 422 });
  }

  const amount = Math.min(MAX_MATCH_REWARD, matchReward(parsed.data));
  if (amount <= 0) {
    return NextResponse.json({ ok: true, earned: 0, coins: null });
  }

  // The day is UTC here rather than the player's: the room server has no
  // browser to ask, and a day boundary that is a few hours off for some
  // players moves a ceiling, not a balance.
  const { earned, coins, cappedForToday } = await awardMatchCoins(
    parsed.data.userId,
    amount,
    dayKey()
  );
  return NextResponse.json({ ok: true, earned, coins, cappedForToday });
}
