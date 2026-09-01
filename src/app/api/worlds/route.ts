import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { emptyWorldDoc, parseWorldDoc } from "@/lib/worlddoc";
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

// POST /api/worlds — create a new world seeded with a valid empty WorldDoc.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name : "Untitled World";

  // Generate the row id up front so it can be embedded in the WorldDoc itself
  // (the doc's `id` and the row's primary key must match — e.g. for /build/[id]).
  const id = crypto.randomUUID();
  const doc = parseWorldDoc(emptyWorldDoc(id, userId, name));

  const [row] = await db
    .insert(worlds)
    .values({ id, ownerId: userId, name, doc })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
