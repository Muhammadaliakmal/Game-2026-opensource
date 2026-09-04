"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { NIGHT_LOOK, moonDirection } from "@/lib/atmosphere";
import { buildSkyEnvironment } from "./sky-shader";
import { SkyDome } from "./SkyDome";
import { StarField } from "./StarField";
import { MoonSprite } from "./MoonSprite";

/**
 * Night: gradient, stars, moon, fog, environment and fill, as one component.
 *
 * The twin of `SunsetSky`, sharing all of its machinery and none of its
 * numbers — see `NIGHT_LOOK` in lib/atmosphere.ts, which carries both the
 * gradient and the fog so the two cannot be edited apart. Everything is
 * declared as JSX rather than assigned onto `scene`, so R3F binds and restores
 * it: that is what lets this be mounted only while playing and leave the
 * editor's own neutral studio lighting untouched when it unmounts.
 *
 * ── Why the moon does not drift and the sun does ─────────────────────────
 *
 * `SunsetSky` advances its sun by a fraction of a degree per minute because a
 * sunset is a thing in the middle of happening and MAP.md §4.3 asks that
 * something always be moving. At night the moving thing is the twinkle, which
 * costs one uniform write; drifting the moon as well would mean rebuilding the
 * environment map to keep the reflections honest, for a change nobody could
 * see over three laps. So the moon is fixed and `useSunDir` is not used here.
 *
 * ── What this deliberately does not do ───────────────────────────────────
 *
 * No key light and no shadows. `<FollowSun>` is the one shadow-caster in every
 * canvas; the caller points it along `moonDirection()` and gives it
 * `NIGHT_LOOK`'s colour and intensity. A directional light in here as well
 * would give the scene two moons pointing different ways.
 */
export function NightSky() {
  const gl = useThree((s) => s.gl);

  /**
   * The environment map, rendered from the same gradient the dome paints.
   *
   * Built once and never rebuilt: nothing in this sky moves that a blurred
   * irradiance map could represent. It matters more at night than it did at
   * sunset — with so little direct light, this is most of what keeps a `metal`
   * finish from reading as a flat black hole.
   */
  const env = useMemo(
    () => buildSkyEnvironment(gl, moonDirection(), NIGHT_LOOK),
    [gl]
  );

  // Allocated outside the R3F tree, so nothing else will free it.
  useEffect(() => env.dispose, [env]);

  // The dome shares the sun/moon direction through a ref because the sunset's
  // does move. Here it is a constant, so the ref is filled once.
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

      <Environment
        map={env.texture}
        background={false}
        environmentIntensity={NIGHT_LOOK.envIntensity}
      />

      <SkyDome sunDir={moonRef} look={NIGHT_LOOK} />
      <StarField />
      <MoonSprite />

      {/* Fill. Cool from above, near-black from below, so the shadowed side of
          a block is moonlit rather than merely dark. */}
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
