import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { awardArcadeCoins } from "@/lib/db/players";
import { rateFor } from "@/lib/arcade-payout";

/**
 * POST /api/arcade/payout — turn a finished arcade run into coins.
 *
 * ── What the client controls, and what it does not ───────────────────────
 *
 * It controls the game id, the score, and the date it thinks it is. It does
 * not control the rate, the cap, or the arithmetic — all three are on this
 * side, and the day's ceiling is clamped in SQL against a column the client
 * cannot write. See `lib/arcade-payout.ts` for why the ceiling is the whole
 * defence rather than a check on the score, and `lib/coins.ts` for the same
 * position stated about courses.
 *
 * The date is taken from the request because a daily cap should roll over at
 * the player's midnight and only their browser knows when that is. The worst
 * a lie about it buys is one extra day's ceiling, which is a cosmetic.
 *
 * ── A signed-out player gets a 401, and that is not an error to show ─────
 *
 * There is no wallet to pay into. The client treats it as "no coins this run"
 * and the death screen simply does not mention them, the same way the shop is
 * browsable signed out but not buyable.
 */

/** Matches YYYY-MM-DD and nothing else. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const gameId = typeof body?.gameId === "string" ? body.gameId : "";
  const score = typeof body?.score === "number" ? body.score : NaN;
  const date = typeof body?.date === "string" && DATE.test(body.date) ? body.date : "";

  const rate = rateFor(gameId);
  if (rate <= 0) {
    // Covers both "no such game" and "this one does not pay" — the host's own
    // test pattern among them. Neither is a payout and neither says which.
    return NextResponse.json({ error: "Not a paying game" }, { status: 404 });
  }
  if (!Number.isFinite(score) || score <= 0 || !date) {
    return NextResponse.json({ error: "Bad run" }, { status: 400 });
  }

  const { earned, coins, cappedForToday } = await awardArcadeCoins(
    userId,
    score,
    rate,
    date
  );

  return NextResponse.json({ ok: true, earned, coins, cappedForToday });
}
