"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * When a loading cover is allowed to clear.
 *
 * ── The black screen this exists to stop ─────────────────────────────────
 *
 * The obvious signal is the Canvas's `onCreated`, and it is the wrong one.
 * `onCreated` fires when the WebGLRenderer has been constructed — before the
 * canvas's children have mounted, before Rapier has built a single collider,
 * and, under `frameloop="never"`, before anything has been drawn at all: the
 * first `advance()` comes from `<FrameLimiter>` on a later rAF. So a cover
 * that clears there clears onto a canvas that has painted nothing, and what
 * the player sees is a black rectangle with no error anywhere.
 *
 * It is invisible on a desktop with a warm cache, because the gap between the
 * renderer existing and the first frame is a few milliseconds. On a phone, on
 * a ten-thousand-part track, standing up the instanced buckets and the
 * greedy-meshed colliders is the better part of a second — and that second is
 * spent looking at black.
 *
 * `WorldCanvas` learned this and grew a `FirstFrame`; the race and the arena
 * were still clearing on `onCreated`, which is why this is one shared module
 * rather than a third copy. A canvas that shows a loading cover uses both
 * halves of this file or neither.
 *
 * ── Why the timeout is not optional ──────────────────────────────────────
 *
 * "Clear on the first frame" strands anyone whose first frame never arrives —
 * a device with no WebGL, a context lost during startup, a driver that refuses
 * the canvas. They would sit on the loading screen forever, which is a worse
 * failure than the one being fixed. After the timeout the cover clears anyway
 * and whatever is behind it (including `<ContextLostNotice />`) gets to speak.
 */
const STRANDED_MS = 8000;

/**
 * `[painted, onPainted]` for a canvas with a loading cover.
 *
 * Mount `<FirstFrame onPainted={onPainted} />` *inside* the Canvas — and only
 * once there is something in the scene worth waiting for. A `FirstFrame`
 * mounted alongside an empty scene reports the first frame of that empty
 * scene, which clears the cover onto exactly the black it was covering.
 */
export function useFirstPaint(): [boolean, () => void] {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (painted) return;
    const t = setTimeout(() => setPainted(true), STRANDED_MS);
    return () => clearTimeout(t);
  }, [painted]);

  return [painted, () => setPainted(true)];
}

/**
 * Fires once, on the first rendered frame.
 *
 * `useFrame` is the only honest signal that a frame happened: it runs inside
 * R3F's render loop, so under `frameloop="never"` it cannot run until
 * `<FrameLimiter>` has actually advanced the clock.
 *
 * The `once` ref is not belt-and-braces. `useFrame` runs every frame for as
 * long as this is mounted, and callers gate it on the state it sets — so
 * without the guard, any caller that forgets the gate calls `setState` sixty
 * times a second forever. Making it harmless to leave mounted is cheaper than
 * requiring every call site to remember.
 */
export function FirstFrame({ onPainted }: { onPainted: () => void }) {
  const once = useRef(false);
  useFrame(() => {
    if (once.current) return;
    once.current = true;
    onPainted();
  });
  return null;
}
