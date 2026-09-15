import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { runs, worlds } from "@/lib/db/schema";
import { isBuiltInWorld, PARKOUR_COURSES } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { ghostSchema } from "@/lib/ghost";
import { coinAward } from "@/lib/coins";
import { awardCoins, awardDailyBonus } from "@/lib/db/players";
import { DAILY_BONUS, dailyPick, dayKey, weekKey } from "@/lib/daily";
import { luckyRoll } from "@/lib/lucky";
import {
  MAX_RUN_MS,
  authorMsFor,
  floorMs as shippedFloorMs,
  medalForAuthor,
  minRunMs,
  type Medal,
} from "@/lib/medals";

/**
 * The leaderboard for one course.
 *
 * ── What is on offer, and what is not ────────────────────────────────────
 *
 * Global and personal best, and the same board over this week alone
 * (`?period=week`) — a fresh start every Monday for everyone who was not
 * here first. Not friends boards: those need a social graph the app does not
 * have, for the same reason `BuildRoom.canEdit` has no collaborator model —
 * inventing one here would mean inventing permissions nobody can grant or
 * revoke.
 *
 * ── Signed in only, on the way in ────────────────────────────────────────
 *
 * A board entry is a claim about a person, so it needs a person. A signed-out
 * player still gets everything the run was worth on its own — the clock, the
 * medal, and a personal best in their browser (see `play/course.ts`) — they
 * simply do not appear on a list of names. Reading the board needs no account
 * at all: a board you have to sign up to look at is a board nobody looks at.
 */

type Params = { params: Promise<{ id: string }> };

/** How many rows a board shows. Ten is a screenful and a round number. */
const TOP_N = 10;
const MAX_N = 50;

const submission = z.object({
  timeMs: z.number().int().positive().max(MAX_RUN_MS),
  ghost: ghostSchema.nullish(),
});

/**
 * Whether runs may be posted against this id at all, and against what floor.
 *
 * A built-in slug is always raceable. A uuid has to be a world that exists and
 * that the caller can legitimately have played: published, or their own. A
 * private world belonging to somebody else must 404 rather than reveal that it
 * exists, which is the same rule the remix path in `POST /api/worlds` follows.
 *
 * It answers the floor at the same time because both callers need the row and
 * neither should read it twice. The two sources are the ones `authorMsFor`
 * names: a shipped course's floor is derived from the `AUTHOR_MS` table it was
 * measured into, and a player's course carries its own in a column the server
 * wrote the last time its document changed — see `lib/course-floor.ts`. Null
 * means "not a course", which a sandbox world genuinely is.
 */
async function raceable(
  id: string,
  userId: string | null
): Promise<{ floorMs: number | null } | null> {
  if (isBuiltInWorld(id)) return { floorMs: shippedFloorMs(id) };
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      ownerId: worlds.ownerId,
      published: worlds.published,
      floorMs: worlds.floorMs,
    })
    .from(worlds)
    .where(eq(worlds.id, id));
  if (!row) return null;
  if (row.published !== 1 && row.ownerId !== userId) return null;
  return { floorMs: row.floorMs };
}

/**
 * GET /api/worlds/:id/runs — the board, plus the caller's own standing.
 *
 * Ghosts are deliberately not in this response. They are the largest thing in
 * the table by an order of magnitude and the board draws none of them; the one
 * that is actually watched is fetched on its own from `runs/ghost`.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();

  const course = await raceable(id, userId);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const asked = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(asked) && asked > 0 ? Math.min(MAX_N, Math.floor(asked)) : TOP_N;

  /*
   * `?period=week` is the same board over this week's times — see the
   * `week_ms` column for why that is a column and not a date filter. The
   * time column and the row predicate are the only two things that differ,
   * so they are chosen once here and every query below is written against
   * them. A weekly row's `timeMs` is its week best, which is what the
   * client draws; the all-time best is a different board.
   */
  const weekly = url.searchParams.get("period") === "week";
  const timeCol = weekly ? runs.weekMs : runs.timeMs;
  const onBoard = weekly
    ? and(eq(runs.worldId, id), eq(runs.weekKey, weekKey()))
    : eq(runs.worldId, id);

  const columns = {
    userId: runs.userId,
    name: runs.name,
    timeMs: sql<number>`${timeCol}`.mapWith(Number),
    medal: runs.medal,
    hasGhost: sql<boolean>`${runs.ghost} is not null`.mapWith(Boolean),
    at: runs.updatedAt,
  };

  const top = await db
    .select(columns)
    .from(runs)
    .where(onBoard)
    // The tie-break matters: without it two identical times swap places
    // between requests and the board looks like it is flickering.
    .orderBy(asc(timeCol), asc(runs.updatedAt))
    .limit(limit);

  // The caller's own row and rank, which is the half of a leaderboard that
  // keeps somebody playing once they are off the bottom of the top ten.
  let me: (typeof top)[number] | null = null;
  let rank: number | null = null;

  if (userId) {
    const [mine] = await db
      .select(columns)
      .from(runs)
      .where(and(onBoard, eq(runs.userId, userId)));
    if (mine) {
      me = mine;
      const [{ ahead }] = await db
        .select({ ahead: sql<number>`count(*)`.mapWith(Number) })
        .from(runs)
        .where(and(onBoard, lt(timeCol, mine.timeMs)));
      rank = ahead + 1;
    }
  }

  // The Author time travels with the board, because it is the only way the
  // client can draw a medal for a course it did not ship with: `medalFor`
  // takes a slug and returns null for every uuid there has ever been.
  return NextResponse.json({
    top,
    me,
    rank,
    period: weekly ? "week" : "all",
    authorMs: authorMsFor(id, course.floorMs),
  });
}

/**
 * POST /api/worlds/:id/runs — submit a finished run.
 *
 * Upserts, keeping the better time. The comparison is in SQL rather than a
 * read-then-write, because two tabs finishing at once would otherwise race and
 * the slower one could land last.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const course = await raceable(id, userId);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = submission.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid run" }, { status: 422 });
  }
  const { timeMs, ghost } = parsed.data;

  // A time far enough under the course's route floor did not happen here. See
  // `minRunMs` for the margin and why there is one: the floor itself is a
  // model of the course and real runs sit within a percent of it, so refusing
  // at the floor refused the fastest genuine runs and froze the board. This
  // used to be a slug lookup, which meant a course somebody built was the one
  // board in the game where a hand-written `fetch` with a small number in it
  // landed unchallenged; the floor now comes from the row for those.
  const minMs = minRunMs(course.floorMs);
  if (minMs !== null && timeMs < minMs) {
    return NextResponse.json({ error: "Impossible time" }, { status: 422 });
  }

  const user = await currentUser().catch(() => null);
  const name =
    user?.firstName?.trim() ||
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    "Runner";

  const medal = medalForAuthor(authorMsFor(id, course.floorMs), timeMs);

  // The best result already held here, read before the upsert overwrites it.
  // `undefined` and `null` are different answers and both matter: never
  // finished pays a first-finish, finished-without-a-medal does not. See
  // `lib/coins.ts` for why the payout is a difference rather than a payment.
  const [previous] = await db
    .select({ medal: runs.medal, timeMs: runs.timeMs })
    .from(runs)
    .where(and(eq(runs.worldId, id), eq(runs.userId, userId)));

  /*
   * Two bests live on one row now, and they move independently: a run that
   * is slower than your all-time best can still be the fastest you have gone
   * this week. So the upsert can no longer be gated by one `setWhere` — it
   * always lands, and each column decides for itself in SQL whether the new
   * time beats the one it holds. The comparisons stay in the statement for
   * the reason they always did: two tabs finishing at once must not let the
   * slower one land last.
   */
  const week = weekKey();
  const better = sql`excluded.time_ms < ${runs.timeMs}`;
  const [row] = await db
    .insert(runs)
    .values({
      worldId: id,
      userId,
      name,
      timeMs,
      medal,
      ghost: ghost ?? null,
      weekMs: timeMs,
      weekKey: week,
    })
    .onConflictDoUpdate({
      target: [runs.worldId, runs.userId],
      set: {
        name: sql`excluded.name`,
        timeMs: sql`least(${runs.timeMs}, excluded.time_ms)`,
        medal: sql`case when ${better} then excluded.medal else ${runs.medal} end`,
        ghost: sql`case when ${better} then excluded.ghost else ${runs.ghost} end`,
        updatedAt: sql`case when ${better} then now() else ${runs.updatedAt} end`,
        // A new week starts from this run; the same week keeps its best.
        weekMs: sql`case when ${runs.weekKey} = ${week} then least(coalesce(${runs.weekMs}, excluded.time_ms), excluded.time_ms) else excluded.time_ms end`,
        weekKey: week,
      },
    })
    .returning({ timeMs: runs.timeMs });

  // Improved means the all-time best moved, which is what decides both the
  // refetch and the payout. Two halves: the row now holds this run's time
  // (so a concurrent faster run from another tab did not win the LEAST),
  // and that time beats what was held before the statement. The second
  // half is a read from before the write, and the window in which two tabs
  // of one player could both pass it is milliseconds wide; what it would
  // double is a cosmetic — see `lib/coins.ts` on what this guard is not.
  const improved =
    row.timeMs === timeMs && (previous === undefined || timeMs < previous.timeMs);

  // Coins are only paid when the run actually landed. A slower attempt —
  // which is most attempts — pays nothing, and paying for one would make the
  // easiest course in the game a vending machine.
  const base = !improved
    ? 0
    : coinAward(
        previous === undefined ? undefined : (previous.medal as Medal | null),
        medal
      );
  // The lucky run: the server rolls, and only on a payout that exists.
  const { earned, lucky } = luckyRoll(base);
  let coins = earned > 0 ? await awardCoins(userId, earned) : null;

  // Today's challenge pays a bonus the first time it is finished today,
  // whatever the time was. It is the course of the day for everyone — the
  // pick is the same pure function the hub used to show it — and the day is
  // UTC for the same reason, so the bonus and the card cannot disagree.
  let daily = 0;
  if (id === dailyPick(PARKOUR_COURSES)?.slug) {
    const bonus = await awardDailyBonus(userId, DAILY_BONUS, dayKey());
    daily = bonus.earned;
    if (daily > 0) coins = bonus.coins;
  }

  return NextResponse.json({
    ok: true,
    improved,
    best: row?.timeMs ?? null,
    medal,
    authorMs: authorMsFor(id, course.floorMs),
    earned,
    lucky,
    daily,
    coins,
  });
}
