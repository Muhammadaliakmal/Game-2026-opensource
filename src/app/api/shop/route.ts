import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { playerState } from "@/lib/db/players";
import { DEFAULT_CHARACTER } from "@/lib/characters";

/**
 * GET /api/shop — the caller's wallet and wardrobe.
 *
 * The catalog itself is deliberately not in this response. It is a constant in
 * `lib/characters.ts` that the client already has in its bundle, and shipping
 * prices and blurbs down a wire on every page load would make the shop a
 * request that can fail rather than a page that can render.
 *
 * A signed-out visitor gets the starting state rather than a 401: the shop
 * should be browsable before anybody signs up, the way `/parkour` is. What
 * they cannot do is buy — that is the POST's problem, not this one's.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({
      coins: 0,
      owned: [],
      character: DEFAULT_CHARACTER,
      signedIn: false,
    });
  }
  const state = await playerState(userId);
  return NextResponse.json({ ...state, signedIn: true });
}
