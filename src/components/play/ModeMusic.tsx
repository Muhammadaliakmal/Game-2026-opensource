"use client";

import { useEffect } from "react";
import { playMusic, stopMusicFor } from "@/lib/music/engine";
import type { StyleId } from "@/lib/music/styles";

/**
 * Plays a mode's track for as long as this is mounted.
 *
 * Like `<Ambient>`, it mounts before the player has pressed anything, and the
 * audio graph cannot exist until they have — so the request is retried on a
 * quarter-second clock until it takes. A cabinet opened on top pushes its own
 * track over this one (`lib/music/engine.ts`), and closing it brings this
 * back without any code here.
 *
 * `owner` keeps two mounts of the same mode — the editor and Play swapping
 * inside one `WorldCanvas` — from withdrawing each other's request.
 */
export function ModeMusic({ style, owner = "mode", seed = 1 }: { style: StyleId; owner?: string; seed?: number }) {
  useEffect(() => {
    if (playMusic(owner, style, seed)) return () => stopMusicFor(owner);
    const t = window.setInterval(() => {
      if (playMusic(owner, style, seed)) window.clearInterval(t);
    }, 250);
    return () => {
      window.clearInterval(t);
      stopMusicFor(owner);
    };
  }, [owner, style, seed]);
  return null;
}
