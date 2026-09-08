import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buyCharacter } from "@/lib/db/players";
import { priceOf } from "@/lib/characters";

/**
 * POST /api/shop/buy — spend coins on a character.
 *
 * The price comes from the catalog on the server, never from the request. That
 * is the whole security model of the shop and it is a small one on purpose:
 * the only thing a caller controls is *which* character, and every other
 * number in the transaction is a constant this process already holds.
 *
 * The debit itself is one conditional UPDATE (see `buyCharacter`), so a
 * double-clicked button, two tabs, or a replayed request all settle to a
 * single purchase rather than two.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";

  // Null covers both "no such character" and "not for sale" — the free default
  // among them. Neither is a purchase, and neither should say which it was.
  const price = priceOf(id);
  if (price === null) {
    return NextResponse.json({ error: "Not for sale" }, { status: 404 });
  }

  const { result, state } = await buyCharacter(userId, id, price);

  if (result === "insufficient") {
    // 402 rather than 400: the request was well formed and the answer is about
    // money, which is exactly what this status is for.
    return NextResponse.json(
      { error: "Not enough coins", ...state },
      { status: 402 }
    );
  }

  // Already owning it is not an error. It is what the second of two identical
  // requests looks like, and the client wants the same state either way.
  return NextResponse.json({ ok: true, bought: result === "bought", ...state });
}
