import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";
import { buildBuiltInDoc, isBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { isRoomServer } from "@/lib/service-auth";

type Params = { params: Promise<{ id: string }> };

/**
 * The room server's private door onto a world.
 *
 * `GET /api/worlds/:id` already serves built-in and published worlds to
 * anybody, which was enough to run a room locally — but a room for a world
 * that is still private got a 404, and no room could ever save. Both need a
 * caller the app trusts more than a browser, which is what the shared secret
 * buys.
 *
 * Every failure here answers 404, including a bad secret. A route that
 * distinguishes "wrong password" from "no such world" is a route that will
 * happily enumerate worlds for anyone who asks.
 */

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * What the room needs to open a session: the world, and the two facts it will
 * police joins with — who owns it and whether anyone else may see it.
 */
export async function GET(req: Request, { params }: Params) {
  if (!isRoomServer(req)) return notFound();
  const { id } = await params;

  // Built-ins are generated, not stored, and have no owner: everyone gets the
  // same starting world. `ownerId: null` is what tells the room nobody may
  // edit this one — see BuildRoom's onAuth.
  const builtIn = buildBuiltInDoc(id, "");
  if (builtIn) {
    return NextResponse.json({
      doc: builtIn,
      ownerId: null,
      published: true,
      builtIn: true,
    });
  }

  if (!isUuid(id)) return notFound();

  const [row] = await db.select().from(worlds).where(eq(worlds.id, id));
  if (!row) return notFound();

  return NextResponse.json({
    doc: row.doc,
    ownerId: row.ownerId,
    published: row.published === 1,
    builtIn: false,
  });
}

/**
 * Write a room's authoritative world back.
 *
 * Called on a debounce while people are building and once more on dispose —
 * see `server/src/persist.ts`. It is deliberately the whole document rather
 * than a log of ops: the room already holds the merged result, and replaying
 * ops into the database would be a second implementation of `applyOp` living
 * where nobody would think to look for it.
 */
export async function POST(req: Request, { params }: Params) {
  if (!isRoomServer(req)) return notFound();
  const { id } = await params;

  if (isBuiltInWorld(id)) {
    return NextResponse.json({ error: "Built-in worlds are read-only." }, { status: 403 });
  }
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  if (!body?.doc) {
    return NextResponse.json({ error: "Missing doc" }, { status: 400 });
  }

  const [row] = await db.select().from(worlds).where(eq(worlds.id, id));
  if (!row) return notFound();

  // id, ownerId and name all come from the row, never from the room. The room
  // is trusted to hold the *parts* — it is the thing people are editing — but
  // it holds a copy of everything else that went stale the moment it loaded,
  // and a rename made in the app while a session is live must survive it.
  let doc;
  try {
    doc = parseWorldDoc({ ...body.doc, id, ownerId: row.ownerId, name: row.name });
  } catch {
    return NextResponse.json({ error: "Invalid WorldDoc" }, { status: 422 });
  }

  await db
    .update(worlds)
    .set({ doc, updatedAt: new Date() })
    .where(eq(worlds.id, id));

  return NextResponse.json({ ok: true, parts: doc.parts.length, props: doc.props.length });
}
