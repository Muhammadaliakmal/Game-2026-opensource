"use client";

import * as THREE from "three";
import { useRef } from "react";
import { NIGHT_LOOK, moonDirection } from "@/lib/atmosphere";
import { SkyDome } from "./SkyDome";
import { StarField } from "./StarField";
import { MoonSprite } from "./MoonSprite";

/**
 * Night: the gradient, the stars, the moon and the fog. Nothing else.
 *
 * The twin of `SunsetSky`, sharing all of its machinery — the same five-stop
 * ramp, the same dome shader — and, deliberately, none of its authority over
 * how the world is lit.
 *
 * ── What this does NOT do, and why that took three attempts ──────────────
 *
 * It does not generate an environment probe. `SunsetSky` does, from the same
 * gradient it paints, and that is genuinely the right call for a sunset: the
 * reflections and the visible sky cannot drift apart because they are the same
 * numbers. Doing it at night renders every `metal` surface black. Metalness
 * 1.0 means the probe is the ONLY thing lighting that surface, and a night sky
 * carries roughly a fiftieth of the light a grey room does. Both canvases keep
 * the RoomEnvironment they always had.
 *
 * The fill it does render is the editor's own, value for value — see
 * `NIGHT_LOOK`. Night is a property of the background, not of the lighting: a
 * world lit differently is a world that is a different colour, and in a game
 * whose entire subject is colours somebody placed block by block, that is the
 * content, not the mood.
 *
 * No key light and no shadows either. `<FollowSun>` is the one shadow-caster
 * in every canvas; the caller points it along `moonDirection()`, which is
 * aimed at the angle the key was always at, so the shadows fall where they
 * always did AND where the moon you can see says they should.
 */
export function NightSky() {
  // The dome shares the light direction through a ref because the sunset's
  // does drift. Here it is a constant, so the ref is filled once.
  const moonRef = useRef<THREE.Vector3>(moonDirection());

  return (
    <>
      {/* One constant behind both, so the world-edge seam MAP.md §3.1 warns
          about cannot appear: the fog fades into exactly the colour the sky
          already is at the horizon. */}
      <fogExp2 attach="fog" args={[NIGHT_LOOK.fogHex, NIGHT_LOOK.fogDensity]} />
      {/* Visible only for the frame before the dome draws — but on a slow
          phone that frame is long enough to read as a flash. */}
      <color attach="background" args={[NIGHT_LOOK.fogHex]} />

      <SkyDome sunDir={moonRef} look={NIGHT_LOOK} />
      <StarField />
      <MoonSprite />

      {/* The editor's own fill, value for value. See the header. */}
      <hemisphereLight
        args={[
          NIGHT_LOOK.hemiSky,
          NIGHT_LOOK.hemiGround,
          NIGHT_LOOK.hemiIntensity,
        ]}
      />
    </>
  );
}
