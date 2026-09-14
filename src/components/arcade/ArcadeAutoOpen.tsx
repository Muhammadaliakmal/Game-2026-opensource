"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { entryFor } from "@/arcade/registry";
import { useArcade } from "@/arcade/store";

/**
 * `/arcade?play=<id>` opens that cabinet on arrival.
 *
 * The cabinets open through the store rather than a route, which is right
 * for the overlay — but it meant no cabinet had an address, so nothing
 * outside this page could point at one. This gives each one a link the
 * front page's tiles and the Continue chip can use. Renders nothing; the
 * lobby draws the overlay as it always did.
 */
export function ArcadeAutoOpen() {
  const params = useSearchParams();
  const play = params.get("play");
  const open = useArcade((s) => s.open);

  useEffect(() => {
    if (play && entryFor(play)) open(play);
  }, [play, open]);

  return null;
}
