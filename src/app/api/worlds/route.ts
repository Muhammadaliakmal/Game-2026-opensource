import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";
import { parkourWorldDoc } from "@/lib/parkour";
import { buildBuiltInDoc, getBuiltInWorld } from "@/lib/built-in-worlds";
import { eq } from "drizzle-orm";

// GET /api/worlds — list the signed-in user's worlds.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db.select().from(worlds).where(eq(worlds.ownerId, userId));
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

  // `from` remixes a built-in world into a row the caller owns — the only way
  // to edit one, since the originals are generated and read-only.
  const source = typeof body?.from === "string" ? getBuiltInWorld(body.from) : undefined;
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : source
        ? `${source.name} (remix)`
        : "Untitled World";

  // Generate the row id up front so it can be embedded in the WorldDoc itself
  // (the doc's `id` and the row's primary key must match — e.g. for /build/[id]).
  const id = crypto.randomUUID();
  const seed = source
    ? { ...buildBuiltInDoc(source.slug, userId)!, id, name }
    : parkourWorldDoc(id, userId, name);
  const doc = parseWorldDoc(seed);

  const [row] = await db
    .insert(worlds)
    .values({ id, ownerId: userId, name, doc })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
