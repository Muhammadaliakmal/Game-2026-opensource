"use client";

import Link from "next/link";
import { useLastPlayed } from "@/lib/last-played";

const KIND_LABEL = {
  world: "Continue",
  race: "Back to",
  arena: "Back to",
  arcade: "Continue",
} as const;

/**
 * "Continue · Sky Yard" — the last game opened, one press away.
 *
 * Nothing on a first visit and nothing on the server, so it appears only
 * once there is something true to say. It sits in the heading row rather
 * than as a tile, because a tile for "the thing you already know" would
 * push the things you might not down the page.
 */
export function ContinueChip() {
  const last = useLastPlayed();
  if (!last) return null;
  return (
    <Link href={last.href} className="hud-chip hud-chip--primary">
      {KIND_LABEL[last.kind]} · {last.title}
    </Link>
  );
}
