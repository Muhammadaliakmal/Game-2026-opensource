"use client";

import { useEffect } from "react";
import { useArcade } from "@/arcade/store";
import {
  ambientPlaying,
  setAmbientDuck,
  setAmbientIntensity,
  startAmbient,
  stopAmbient,
  type Mood,
} from "@/lib/ambient";
import { useCourse } from "./course";

/**
 * Keeps one ambient bed running for as long as this is mounted.
 *
 * A DOM component, not a canvas one: the bed has no frame loop, and mounting
 * it outside the Canvas means the race and the world can share it without
 * either needing R3F context to make a noise.
 *
 * ── Starting before there is a gesture ───────────────────────────────────
 *
 * The graph cannot run until the player has pressed something, and this
 * mounts before they have. So `startAmbient` is retried on a short clock
 * until it takes — a quarter-second poll costs nothing and stops itself the
 * moment the bed exists. The alternative, hanging the retry on the same
 * pointer event `lib/audio.ts` resumes on, races that resume's promise.
 *
 * ── The cabinet ducks it ─────────────────────────────────────────────────
 *
 * A cabinet plays its own track. Two beds is a mess, so the world's drops to
 * a murmur while `activeGame` is set and comes back when it clears — the
 * same signal `FrameLimiter` pauses the render on.
 */
export function Ambient({ mood, intensity }: { mood: Mood; intensity: number }) {
  useEffect(() => {
    startAmbient(mood);
    if (ambientPlaying()) return;
    const t = window.setInterval(() => {
      startAmbient(mood);
      if (ambientPlaying()) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [mood]);

  useEffect(() => () => stopAmbient(), []);

  useEffect(() => {
    setAmbientIntensity(intensity);
  }, [intensity]);

  useEffect(() => {
    const apply = (open: boolean) => setAmbientDuck(open ? 0.12 : 1);
    apply(useArcade.getState().activeGame !== null);
    return useArcade.subscribe((s) => apply(s.activeGame !== null));
  }, []);

  return null;
}

/** The world's bed, with the run as its intensity: up while the clock runs. */
export function CourseAmbient({ mood }: { mood: Mood }) {
  const running = useCourse((s) => s.startedAt !== null && s.finishedMs === null);
  return <Ambient mood={mood} intensity={running ? 1 : 0} />;
}
