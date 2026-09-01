"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";

/**
 * Footstep, jump and landing SFX — synthesised at runtime, no asset files.
 *
 * Every sound is one short burst of white noise shaped by a lowpass filter and
 * an exponential gain envelope. That's enough for readable "thud" and "tick"
 * cues; real samples arrive with the Phase 3 asset pipeline. Filtered noise is
 * also cheap and pools naturally — each hit is a throwaway BufferSource.
 *
 * The AudioContext can't start until a user gesture, so it's created lazily and
 * resumed on the first pointer/key event.
 */
export function useFootstepAudio(handleRef: RefObject<EcctrlHandle | null>) {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const stepClock = useRef(0);
  const wasOnGround = useRef(true);
  const wasJumping = useRef(false);

  useEffect(() => {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = FEEL.audioVolume;
    master.connect(ctx.destination);

    // 0.4s of white noise, reused for every hit.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    ctxRef.current = ctx;
    masterRef.current = master;
    noiseRef.current = buf;

    const resume = () => {
      if (ctx.state === "suspended") void ctx.resume();
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      void ctx.close();
    };
  }, []);

  const hit = (dur: number, cutoff: number, gain: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buf = noiseRef.current;
    if (!ctx || !master || !buf || ctx.state !== "running") return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;

    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter).connect(env).connect(master);
    src.start(now);
    src.stop(now + dur);
  };

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // Jump: rising edge of jumpActive — a short airy tick.
    if (h.jumpActive && !wasJumping.current) hit(0.12, 900, 0.25);
    wasJumping.current = h.jumpActive;

    // Landing: rising edge of isOnGround, weighted by impact speed.
    if (h.isOnGround && !wasOnGround.current) {
      const impact = Math.min(1, Math.abs(h.verticalSpeed) / FEEL.hardLandVel);
      hit(0.1 + impact * 0.16, 260 + impact * 200, 0.2 + impact * 0.6);
    }
    wasOnGround.current = h.isOnGround;

    // Footsteps: cadence tracks ground speed so a run sounds faster than a walk.
    if (h.isMoving && h.isOnGround && h.moveSpeed > 0.4) {
      stepClock.current -= dt;
      if (stepClock.current <= 0) {
        hit(0.07, 800, 0.22);
        const rate = Math.max(0.5, h.moveSpeed / FEEL.walkSpeed);
        stepClock.current = FEEL.footstepGap / rate;
      }
    } else {
      // Land the next step promptly when movement resumes.
      stepClock.current = Math.min(stepClock.current, 0.08);
    }
  });
}
