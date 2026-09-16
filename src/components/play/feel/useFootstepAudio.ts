"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";
import { jitter, noiseHit, toneHit, type HitOptions } from "@/lib/audio";
import { keyOf } from "@/lib/cell-key";
import { TEXTURES } from "@/lib/texture-list";
import { textureOf } from "@/lib/worlddoc";
import { useEditorStore } from "@/stores/editor-store";
import { playerFocus } from "../camera-rig";

/**
 * Footstep, jump and landing SFX.
 *
 * Every sound is one short burst of white noise shaped by a lowpass filter and
 * an exponential gain envelope — enough for readable "thud" and "tick" cues,
 * with no asset files to ship. The graph itself (context, master gain, mute)
 * lives in `lib/audio` so the editor's placement sounds and the mute button
 * share one signal chain.
 *
 * ── The step knows what it landed on ─────────────────────────────────────
 *
 * A part's eighth field is its surface, and the surface's *name* is what the
 * foot reads: grass is soft and short, stone clicks, planks knock with a
 * little wooden tone under the noise, metal rings. The block is found by
 * looking straight down from the character through the parts map — the same
 * integer-grid lookup the editor uses to place — so this costs a Map read per
 * step rather than a raycast per frame. A block with no surface, and a cell
 * with nothing under it (mid-air, a prop), fall back to the plain step.
 *
 * Every step is also detuned by a few percent. The same burst forty times in a
 * row is what makes footsteps sound like a metronome; five percent either way
 * is below what anyone hears as a change of pitch and above what they hear as
 * a loop.
 *
 * ── There is no sprint wind any more ─────────────────────────────────────
 *
 * There was: a looping noise through a wide bandpass, faded in over the first
 * seconds of a sprint. On headphones it was a rush of air. On a phone
 * speaker — which cannot carry the low half of it — it was four seconds of
 * swelling static every time the runner set off, and it was reported as
 * "distortion when the character moves". A sound that reads as a fault on
 * the device most people play on is not worth what it adds on the other.
 */

/** How a surface sounds underfoot. `tone` adds a pitched knock under the noise. */
interface StepProfile {
  cutoff: number;
  dur: number;
  gain: number;
  tone?: { freq: number; gain: number; type: OscillatorType };
}

const PLAIN: StepProfile = { cutoff: 800, dur: 0.07, gain: 0.22 };

const PROFILES: Record<string, StepProfile> = {
  plain: PLAIN,
  grass: { cutoff: 520, dur: 0.06, gain: 0.16 },
  dirt: { cutoff: 600, dur: 0.075, gain: 0.2 },
  sand: { cutoff: 420, dur: 0.09, gain: 0.17 },
  snow: { cutoff: 380, dur: 0.1, gain: 0.14 },
  stone: { cutoff: 1500, dur: 0.05, gain: 0.2 },
  cobble: { cutoff: 1700, dur: 0.05, gain: 0.21 },
  brick: { cutoff: 1400, dur: 0.055, gain: 0.2 },
  planks: { cutoff: 900, dur: 0.07, gain: 0.2, tone: { freq: 190, gain: 0.07, type: "triangle" } },
  bark: { cutoff: 700, dur: 0.075, gain: 0.19, tone: { freq: 150, gain: 0.05, type: "triangle" } },
  metal: { cutoff: 2600, dur: 0.09, gain: 0.16, tone: { freq: 620, gain: 0.05, type: "sine" } },
};

/** Surface index → profile, resolved once so a step is a Map read and an array index. */
const BY_INDEX: StepProfile[] = TEXTURES.map((t) => PROFILES[t.name] ?? PLAIN);

/** Centre of the capsule to the sole of the foot, in world units. */
const FOOT_DROP = 0.3 + 0.3 + 0.2;

/** The surface under the character, or the plain one if nothing is there. */
function underfoot(): StepProfile {
  const parts = useEditorStore.getState().parts;
  const x = Math.floor(playerFocus.x);
  const z = Math.floor(playerFocus.z);
  const top = Math.floor(playerFocus.y - FOOT_DROP - 0.05);
  for (let y = top; y >= top - 2; y--) {
    const p = parts.get(keyOf(x, y, z));
    if (p) return BY_INDEX[textureOf(p)] ?? PLAIN;
  }
  return PLAIN;
}

const IMPACT: HitOptions = { bus: "impact", voice: "step", maxVoices: 4 };

export function useFootstepAudio(handleRef: RefObject<EcctrlHandle | null>) {
  const stepClock = useRef(0);
  const wasOnGround = useRef(true);
  const wasJumping = useRef(false);

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // Jump: rising edge of jumpActive — a short airy tick.
    if (h.jumpActive && !wasJumping.current) {
      noiseHit(0.12, 900, 0.25, { ...IMPACT, rate: jitter(0.05) });
    }
    wasJumping.current = h.jumpActive;

    // Landing: rising edge of isOnGround, weighted by impact speed.
    if (h.isOnGround && !wasOnGround.current) {
      const impact = Math.min(1, Math.abs(h.verticalSpeed) / FEEL.hardLandVel);
      const s = underfoot();
      noiseHit(0.1 + impact * 0.16, s.cutoff * 0.45 + impact * 200, 0.2 + impact * 0.6, {
        bus: "impact",
        rate: jitter(0.05),
      });
      if (s.tone) {
        toneHit(s.tone.freq * 0.8, 0.12 + impact * 0.1, s.tone.gain * (0.6 + impact), s.tone.type, {
          bus: "impact",
        });
      }
    }
    wasOnGround.current = h.isOnGround;

    // Footsteps: cadence tracks ground speed so a run sounds faster than a walk.
    const moving = h.isMoving && h.isOnGround && h.moveSpeed > 0.4;
    if (moving) {
      stepClock.current -= dt;
      if (stepClock.current <= 0) {
        const s = underfoot();
        const rate = jitter(0.05);
        noiseHit(s.dur, s.cutoff * rate, s.gain, { ...IMPACT, rate });
        if (s.tone) {
          toneHit(s.tone.freq * rate, s.dur * 1.4, s.tone.gain, s.tone.type, IMPACT);
        }
        const cadence = Math.max(0.5, h.moveSpeed / FEEL.walkSpeed);
        stepClock.current = FEEL.footstepGap / cadence;
      }
    } else {
      // Land the next step promptly when movement resumes.
      stepClock.current = Math.min(stepClock.current, 0.08);
    }
  });
}
