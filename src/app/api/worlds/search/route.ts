import { NextResponse } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";

/**
 * GET /api/worlds/search?q=<text> — published worlds whose name contains it.
 *
 * Public, metadata only, capped at eight: this backs the search box on the
 * games hub, which already knows every built-in game and only needs the
 * worlds people made. The built-ins are not in the database and are matched
 * in the browser, so the two lists never disagree about what exists.
 *
 * `ilike` with the term escaped: `%` and `_` in a query are letters somebody
 * typed, not wildcards. Two characters minimum, because "a" matches every
 * world and the eight it returns are noise.
 *
 * The backslash escapes itself as well as the two wildcards, and it has to:
 * Postgres rejects a LIKE pattern that ends in the escape character, so a
 * search for a single trailing `\` would be a 500 rather than no results.
 */
export const dynamic = "force-dynamic";

/**
 * `%`, `_` and `\` are letters here. Backslash is LIKE's default escape.
 *
 * Exported for `game-index.test.ts`, because the first version of this was a
 * template literal that escaped the `$` instead of emitting a backslash and
 * so replaced every wildcard with the four characters `${c}` — a bug that is
 * invisible by inspection and obvious to an assertion.
 */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => "\\" + c);
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]);

  const pattern = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      playCount: worlds.playCount,
      floorMs: worlds.floorMs,
    })
    .from(worlds)
    .where(and(eq(worlds.published, 1), ilike(worlds.name, pattern)))
    .orderBy(desc(worlds.playCount), desc(worlds.updatedAt))
    .limit(8);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      plays: r.playCount,
      // A world with a route floor is a course somebody built.
      kind: r.floorMs !== null ? "course" : "world",
    })),
    { headers: { "cache-control": "public, max-age=30" } }
  );
}
