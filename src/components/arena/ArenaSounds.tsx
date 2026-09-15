"use client";

import { useEffect } from "react";
import { duckBus, noiseHit, toneHit } from "@/lib/audio";
import { useArenaStore } from "@/stores/arena-store";

/**
 * The arena's cues. No frame loop — everything here is an event the server
 * decided, so it is one store subscription comparing each state to the last.
 *
 * ── The knockdown's silence ──────────────────────────────────────────────
 *
 * A knockdown is a bass hit and then *nothing* for a tenth of a second: the
 * `impact` bus is ducked under the hit and the `game` bus with it, so the
 * strike is followed by a hole the ear falls into before anything else
 * sounds. The hole is the weight. A knockdown that is merely a louder punch
 * is a punch.
 *
 * ── The hits differ by which end you are on ──────────────────────────────
 *
 * Landing one is sharp and bright — the crunch the spec asks for. Taking one
 * is the same hit with the top rolled off and a lower thud under it, which is
 * what a blow sounds like from inside. Both are on `impact`, both are capped
 * at four voices, which is a flurry and not a wall.
 */

/** A4-relative pitch. */
const hz = (semitones: number) => 440 * Math.pow(2, semitones / 12);

function bell(semitones: number, at: number, gain: number, dur = 0.35) {
  toneHit(hz(semitones), dur, gain, "sine", { bus: "game", at, glide: 1 });
  toneHit(hz(semitones + 12), dur * 0.5, gain * 0.25, "triangle", { bus: "game", at, glide: 1 });
}

function sfxLanded() {
  noiseHit(0.07, 3200, 0.3, { bus: "impact", voice: "punch", maxVoices: 4 });
  noiseHit(0.1, 700, 0.25, { bus: "impact", voice: "punch", maxVoices: 4 });
  toneHit(140, 0.09, 0.14, "triangle", { bus: "impact", glide: 0.5 });
}

function sfxHurt() {
  noiseHit(0.12, 500, 0.32, { bus: "impact", voice: "punch", maxVoices: 4 });
  toneHit(90, 0.16, 0.2, "sine", { bus: "impact", glide: 0.45 });
}

function sfxKnockdown(me: boolean) {
  // The hit, then the hole, then the reaction.
  toneHit(55, 0.4, 0.45, "sine", { bus: "impact", glide: 0.4 });
  noiseHit(0.2, 300, 0.4, { bus: "impact" });
  duckBus("game", 0.05, 0.14, 0.35);
  duckBus("impact", 0.1, 0.14, 0.2);
  // Down: a falling pair. Up: a rising one. Same interval, opposite way.
  if (me) {
    toneHit(hz(-5), 0.2, 0.09, "triangle", { bus: "game", at: 0.3, glide: 1 });
    toneHit(hz(-12), 0.35, 0.09, "triangle", { bus: "game", at: 0.42, glide: 1 });
  } else {
    toneHit(hz(0), 0.2, 0.09, "triangle", { bus: "game", at: 0.3, glide: 1 });
    toneHit(hz(7), 0.35, 0.1, "triangle", { bus: "game", at: 0.42, glide: 1 });
    noiseHit(0.4, 4500, 0.04, { bus: "game", at: 0.42 });
  }
}

/** Somebody is one knockdown from the match. Tension, not celebration. */
function sfxMatchPoint() {
  toneHit(hz(-24), 0.9, 0.12, "sawtooth", { bus: "game", glide: 1.06 });
  toneHit(hz(-23), 0.9, 0.08, "sawtooth", { bus: "game", glide: 1.06 });
  noiseHit(0.5, 1200, 0.05, { bus: "game", at: 0.3 });
}

/** The bell. Three beats and a longer fourth: the round is on. */
function sfxRoundStart() {
  [0, 0.4, 0.8].forEach((at) => toneHit(hz(0), 0.12, 0.12, "square", { bus: "game", at, glide: 1 }));
  toneHit(hz(7), 0.5, 0.14, "square", { bus: "game", at: 1.2, glide: 1 });
  toneHit(hz(19), 0.5, 0.05, "square", { bus: "game", at: 1.2, glide: 1 });
}

function sfxMatchOver(won: boolean) {
  if (won) {
    [0, 4, 7, 12].forEach((n, i) => bell(n, i * 0.09, 0.12, 0.5));
    bell(16, 0.45, 0.13, 0.9);
    noiseHit(0.6, 5000, 0.04, { bus: "game", at: 0.45 });
  } else {
    // Distinct and final, not punishing: a settled low chord, no fall.
    bell(-12, 0, 0.1, 0.8);
    bell(-5, 0, 0.08, 0.8);
    bell(-8, 0.15, 0.07, 0.7);
  }
}

/** The score that ends a match. Mirrors ArenaHud's WIN_AT. */
const WIN_AT = 5;

export function ArenaSounds() {
  useEffect(
    () =>
      useArenaStore.subscribe((s, prev) => {
        if (s.downTick !== prev.downTick) sfxKnockdown(s.downWasMe);
        else if (s.hurtTick !== prev.hurtTick) sfxHurt();
        else if (s.landedTick !== prev.landedTick) sfxLanded();

        if (s.phase === "fighting" && prev.phase !== "fighting") sfxRoundStart();
        if (s.phase === "over" && prev.phase !== "over") sfxMatchOver(s.winner === s.selfId);

        // Match point: the first moment anybody is one short. Once, on the
        // rising edge, so a long stalemate at 4-4 is not a siren.
        const top = Math.max(0, ...s.fighters.map((f) => f.score));
        const wasTop = Math.max(0, ...prev.fighters.map((f) => f.score));
        if (s.phase === "fighting" && top === WIN_AT - 1 && wasTop < WIN_AT - 1) sfxMatchPoint();
      }),
    []
  );
  return null;
}
