import { duckBus, noiseHit, toneHit, type Bus } from "@/lib/audio";
import type { Medal } from "@/lib/medals";

/**
 * The parkour course's own cues: the sounds that mark a run rather than a
 * step. Synthesised on the shared graph like everything else, and every phrase
 * is scheduled on the audio clock with `at`, so a stinger that starts on the
 * frame the panel opens keeps its rhythm whatever that frame cost.
 *
 * ── Why the checkpoint climbs ────────────────────────────────────────────
 *
 * Every gate is the same chime a whole tone higher than the last. On a run
 * you cannot see the end of, that is the ear's progress bar: the fourth gate
 * sounds *later* than the second, and a restart audibly drops back to the
 * root. `sfxSpawn` — which the gates used to share with the editor's spawn
 * tool — said only "something was confirmed".
 *
 * ── The medal ladder in three tiers ──────────────────────────────────────
 *
 * Bronze is two notes, Silver three, Gold four with a fifth on top, and Author
 * is Gold with a shimmer. Each is the previous one plus something, which is
 * what "richer than the last" means when the instrument is a triangle wave:
 * a Gold that is merely a louder Bronze does not read as a better medal.
 */

const GAME: Bus = "game";

/** Concert A4, and the major scale the chimes walk in semitones above it. */
const A4 = 440;
const hz = (semitones: number) => A4 * Math.pow(2, semitones / 12);

/** A soft bell: sine fundamental, a quiet triangle an octave up, no glide. */
function bell(semitones: number, at: number, gain: number, dur = 0.32) {
  toneHit(hz(semitones), dur, gain, "sine", { bus: GAME, at, glide: 1 });
  toneHit(hz(semitones + 12), dur * 0.6, gain * 0.28, "triangle", {
    bus: GAME,
    at,
    glide: 1,
  });
}

/**
 * Checkpoint `index` (0-based) reached. Root on the first gate, a whole tone
 * up per gate, wrapping after an octave so a forty-gate course cannot squeak.
 */
export function sfxCheckpoint(index: number) {
  const step = (index * 2) % 12;
  bell(-9 + step, 0, 0.12, 0.26);
  bell(-9 + step + 7, 0.09, 0.09, 0.3);
}

/**
 * Course complete: the resolution the checkpoints were climbing towards. A
 * rising fourth into the tonic, then the tonic held with its fifth.
 */
export function sfxCourseComplete() {
  bell(-2, 0, 0.11, 0.2);
  bell(0, 0.12, 0.11, 0.2);
  bell(3, 0.24, 0.13, 0.55);
  bell(10, 0.24, 0.09, 0.55);
  noiseHit(0.25, 3200, 0.05, { bus: GAME, at: 0.24 });
}

/** The medal stinger, after the completion phrase has landed. */
export function sfxMedal(medal: Medal, at = 0.85) {
  const notes: Record<Medal, number[]> = {
    bronze: [3, 7],
    silver: [3, 7, 10],
    gold: [3, 7, 10, 15],
    author: [3, 7, 10, 15, 19],
  };
  const seq = notes[medal];
  seq.forEach((n, i) => bell(n, at + i * 0.1, 0.11, 0.45));
  if (medal === "gold" || medal === "author") {
    // The shimmer: a bright hiss under the top note, which is the difference
    // between a chime and a fanfare.
    noiseHit(0.5, 6000, 0.035, { bus: GAME, at: at + (seq.length - 1) * 0.1 });
  }
  if (medal === "author") {
    bell(27, at + seq.length * 0.1, 0.07, 0.8);
  }
}

/**
 * A new personal best: a distinct "record" fanfare that is neither the
 * completion phrase nor a medal — a fast upward run and a held top.
 */
export function sfxPersonalBest(at = 0.5) {
  [0, 4, 7, 12].forEach((n, i) =>
    toneHit(hz(n), 0.09, 0.1, "triangle", { bus: GAME, at: at + i * 0.055, glide: 1 })
  );
  bell(16, at + 0.25, 0.13, 0.7);
  bell(12, at + 0.25, 0.08, 0.7);
}

/**
 * The ghost changed places with the player.
 *
 * A whoosh — noise swept through a rising or falling lowpass — panned to the
 * side the ghost is on, so the ear knows which way to look. Passing them
 * rises; being passed falls. The `impact` bus is ducked for a hair under it,
 * so the whoosh is heard rather than buried under the footsteps it interrupts.
 */
export function sfxGhostPass(overtook: boolean, pan: number) {
  duckBus("impact", 0.55, 0.12, 0.2);
  const from = overtook ? 500 : 2400;
  const to = overtook ? 2600 : 420;
  // Two short bursts a few ms apart with different cutoffs approximate a sweep
  // without a dedicated automation node per call.
  noiseHit(0.16, from, 0.16, { bus: GAME, pan, voice: "ghost", maxVoices: 6 });
  noiseHit(0.18, (from + to) / 2, 0.13, { bus: GAME, pan, at: 0.06, voice: "ghost", maxVoices: 6 });
  noiseHit(0.2, to, 0.1, { bus: GAME, pan, at: 0.12, voice: "ghost", maxVoices: 6 });
  toneHit(overtook ? 660 : 520, 0.14, 0.05, "sine", {
    bus: GAME,
    pan,
    at: 0.1,
    glide: overtook ? 1.5 : 0.6,
  });
}
