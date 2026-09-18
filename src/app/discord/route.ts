import { NextResponse } from "next/server";
import { DISCORD_INVITE } from "@/lib/discord";

/**
 * GET /discord — the one address to hand out.
 *
 * The point is indirection. A Discord invite can be regenerated, revoked, or
 * swapped for a vanity URL, and by then it is in video descriptions, on
 * screenshots and in messages nobody can edit. Those all point here instead,
 * and here points at one line of `lib/discord.ts`.
 *
 * ── Temporary, and that is the whole design ──────────────────────────────
 *
 * 307, not 308. A permanent redirect is cached by browsers indefinitely and
 * by some of them beyond a cache clear, which would hard-wire the current
 * invite into every visitor who ever followed the link — destroying exactly
 * the property this route exists to provide. The cache header says the same
 * thing to anything between here and the visitor.
 *
 * `redirect()` from `next/navigation` would also work and throws a control-
 * flow exception to do it. `NextResponse.redirect` is a returned value, which
 * is easier to read and lets the status and the headers be stated outright.
 */
export function GET() {
  return NextResponse.redirect(DISCORD_INVITE, {
    status: 307,
    headers: { "cache-control": "no-store" },
  });
}
