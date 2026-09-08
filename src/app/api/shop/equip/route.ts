import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { equipCharacter } from "@/lib/db/players";
import { isCharacterId, priceOf } from "@/lib/characters";

/**
 * POST /api/shop/equip — wear a character you own.
 *
 * Separate from buying, because they are separate decisions: a player with
 * four characters changes who they are far more often than they buy a fifth,
 * and folding the two together would mean every equip re-ran a purchase path
 * that has money in it.
 *
 * The ownership test is in SQL rather than here — see `equipCharacter`.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!isCharacterId(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A character that costs nothing is owned by everybody and is not in anyone's
  // `owned` list, so it has to be admitted explicitly rather than by lookup.
  const { equipped, state } = await equipCharacter(userId, id, priceOf(id) === null);

  if (!equipped) {
    return NextResponse.json(
      { error: "You do not own that character", ...state },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true, ...state });
}
