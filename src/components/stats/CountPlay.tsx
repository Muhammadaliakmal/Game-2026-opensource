"use client";

import { isKnownSlug } from "@/content/registry";
import { usePlayCount } from "@/lib/use-play-count";

/**
 * Renders nothing. Counts one play of `slug` once it has actually been played.
 *
 * The same shape as `<RememberPlay>` beside it, and for the same reason: the
 * game screens are server components that await their params, and this is a
 * hook. One line on a page rather than a client boundary drawn around it.
 *
 * ── `active` is the screen's own answer ──────────────────────────────────
 *
 * A cabinet passes `status === "playing"`, because a cabinet has a pause
 * screen and a death screen and neither is play. A world passes nothing and
 * gets `true`, because a world has no pause state of its own — leaving the
 * only way to stop playing it, a hidden tab, which the hook handles for every
 * caller.
 *
 * ── An unknown slug is silently ignored ──────────────────────────────────
 *
 * `/play/<uuid>` is a world somebody published, which is not in the registry
 * and has its own counter (`worlds.play_count`, via
 * `POST /api/worlds/:id/play`). Passing the id through anyway keeps the call
 * site free of a conditional that would have to know about that distinction.
 */
export function CountPlay({
  slug,
  active = true,
}: {
  slug: string;
  active?: boolean;
}) {
  usePlayCount(isKnownSlug(slug) ? slug : null, active);
  return null;
}
