"use client";

import { useEffect } from "react";
import { rememberPlay, type LastPlayed } from "@/lib/last-played";

/**
 * Mount on a screen that is a game, and the front page will offer it back.
 * Renders nothing. See lib/last-played.ts for which screens qualify.
 */
export function RememberPlay({ href, title, kind }: LastPlayed) {
  useEffect(() => {
    rememberPlay({ href, title, kind });
  }, [href, title, kind]);
  return null;
}
