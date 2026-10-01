import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { awardMatchCoins } from "@/lib/db/players";
import { MAX_BONUS } from "@/lib/game-ads-policy";

/**
 * POST /api/arcade/bonus — the coins a watched rewarded ad adds to a run.
 *
 * ── What this can and cannot be made to pay ──────────────────────────────
 *
 * The server cannot see the ad. Google tells the page it was watched
 * (`adViewed`), and the page tells us, so a hand-written `fetch` can claim a
 * bonus nobody watched. That is accepted for the reason `api/arcade/payout`
 * accepts a client-computed score, and the defence is the same one: the
 * amount comes out of the arcade's daily pool through the same statement,
 * clamped in SQL against the same ceiling (`DAILY_HARD_CAP`, 1,000 a day).
 * A forged bonus buys nothing a forged score could not already buy, so the
 * sentence in `lib/arcade-payout.ts` — the arcade pays at most a thousand
 * coins a day to anybody, however they got them — stays true unedited.
 *
 * The amount is capped here at `MAX_BONUS` as well as on the client, so the
 * button's promise and the server's limit are the same number.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const amount = typeof body?.amount === "number" ? Math.floor(body.amount) : NaN;
  const date = typeof body?.date === "string" && DATE.test(body.date) ? body.date : "";

  if (!Number.isFinite(amount) || amount <= 0 || !date) {
    return NextResponse.json({ error: "Bad bonus" }, { status: 400 });
  }

  const { earned, coins, cappedForToday } = await awardMatchCoins(
    userId,
    Math.min(amount, MAX_BONUS),
    date
  );

  return NextResponse.json({ ok: true, earned, coins, cappedForToday });
}
