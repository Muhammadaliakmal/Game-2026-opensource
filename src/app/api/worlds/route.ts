import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";
import { parkourWorldDoc } from "@/lib/parkour";
import { buildBuiltInDoc, getBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { desc, eq, sql } from "drizzle-orm";

// GET /api/worlds — list the signed-in user's worlds.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Metadata only: a list endpoint has no business shipping every WorldDoc.
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      published: worlds.published,
      playCount: worlds.playCount,
      updatedAt: worlds.updatedAt,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));
  return NextResponse.json(rows);
}

// POST /api/worlds — seed a new world with the default parkour course.
// SPEC §9 #5: never drop a new user into a blank void.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // `from` remixes an existing world into a row the caller owns: a built-in
  // slug (the only way to edit one, since those are generated and read-only)
  // or the id of any published world. SPEC §9 #4 calls remix the strongest UGC
  // retention driver, and it's nearly free once the doc is already a value.
  const from = typeof body?.from === "string" ? body.from : undefined;
  const builtIn = from ? getBuiltInWorld(from) : undefined;

  // Generate the row id up front so it can be embedded in the WorldDoc itself
  // (the doc's `id` and the row's primary key must match — e.g. for /build/[id]).
  const id = crypto.randomUUID();

  let seed;
  let sourceName: string | undefined;

  if (builtIn) {
    seed = buildBuiltInDoc(builtIn.slug, userId)!;
    sourceName = builtIn.name;
  } else if (from) {
    // Only published worlds can be remixed — anything else must 404 rather
    // than reveal that a private world exists. The uuid check comes first:
    // `from` is caller-supplied, and a non-uuid would be a query error.
    if (!isUuid(from)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [src] = await db.select().from(worlds).where(eq(worlds.id, from));
    if (!src || src.published !== 1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    seed = src.doc;
    sourceName = src.name;
  } else {
    seed = parkourWorldDoc(id, userId, "Untitled World");
  }

  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : sourceName
        ? `${sourceName} (remix)`
        : "Untitled World";

  const doc = parseWorldDoc({ ...seed, id, ownerId: userId, name });

  const [row] = await db
    .insert(worlds)
    .values({ id, ownerId: userId, name, doc })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
