import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";

type Params = { params: Promise<{ id: string }> };

/** GET /api/worlds/:id — owner-only for now; published worlds open up in Phase 4. */
export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [row] = await db.select().from(worlds).where(eq(worlds.id, id));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(row);
}

/** PUT /api/worlds/:id — save the whole WorldDoc. */
export async function PUT(req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.doc) {
    return NextResponse.json({ error: "Missing doc" }, { status: 400 });
  }

  // Never trust the client's id/ownerId — pin both server-side before validating,
  // so a caller can't reassign someone else's world to themselves.
  let doc;
  try {
    doc = parseWorldDoc({ ...body.doc, id, ownerId: userId });
  } catch {
    return NextResponse.json({ error: "Invalid WorldDoc" }, { status: 422 });
  }

  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : doc.name;

  // The ownerId in the WHERE clause is the authorisation check: a row belonging
  // to someone else simply matches nothing rather than leaking its existence.
  const [row] = await db
    .update(worlds)
    .set({ doc: { ...doc, name }, name, updatedAt: new Date() })
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/** DELETE /api/worlds/:id */
export async function DELETE(_req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [row] = await db
    .delete(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
