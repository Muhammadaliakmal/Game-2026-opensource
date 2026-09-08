import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from ".";
import { worlds } from "./schema";

/**
 * Courses somebody built.
 *
 * ── What makes a world a course ──────────────────────────────────────────
 *
 * `floor_ms is not null`, and nothing else. It is a stronger claim than "the
 * document has a goal": the floor is the solver's route through the geometry,
 * so a world that has one has a goal something can actually reach. A world
 * whose goal is walled off has a goal and no floor — and listing it here would
 * be advertising a course that refuses to be finished.
 *
 * The column is server-derived on every path that writes `doc` (see
 * `lib/course-floor.ts`), so this predicate cannot be set by a client.
 *
 * ── Why newest first, and not most played ────────────────────────────────
 *
 * `worlds_course_idx` is partial — `(published, updated_at) where floor_ms is
 * not null` — so this ordering is an index scan over courses. Ordering by
 * `play_count` instead would match the same rows and then sort all of them,
 * for a signal that reads as zero on every course until somebody finds it,
 * which is the exact problem this list exists to solve.
 */

export interface CommunityCourse {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  playCount: number;
  partCount: number;
  /** The solved route floor. Never null here — it is the list's predicate. */
  floorMs: number;
}

export async function communityCourses(limit = 24): Promise<CommunityCourse[]> {
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      thumbnailUrl: worlds.thumbnailUrl,
      playCount: worlds.playCount,
      // Metadata only, the same rule /browse already follows: a list of
      // courses must not pull two dozen full WorldDocs to print a part count.
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`.mapWith(
        Number
      ),
      floorMs: worlds.floorMs,
    })
    .from(worlds)
    .where(and(eq(worlds.published, 1), isNotNull(worlds.floorMs)))
    .orderBy(desc(worlds.updatedAt))
    .limit(limit);

  // `isNotNull` is in the WHERE clause, but the column's type does not know
  // that. Narrowed here rather than asserted at each call site.
  return rows.map((r) => ({ ...r, floorMs: r.floorMs ?? 0 }));
}
