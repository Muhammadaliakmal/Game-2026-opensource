import * as THREE from "three";
import { SUNSET_LOOK, skyRampUniforms, type SkyLook } from "@/lib/atmosphere";

/**
 * The sky gradient as a material, built twice from one shader.
 *
 * ── Why two variants ─────────────────────────────────────────────────────
 *
 * MAP.md §4.2 layer 2 says to light the scene with a downloaded HDRI, and
 * lists the trade-off itself: "reflections and visible sky are authored
 * separately and can drift apart if one is tuned without the other."
 *
 * They cannot drift apart here, because the environment map is generated from
 * this same gradient. Change a stop in lib/atmosphere.ts and the sky, the fog,
 * the reflection in the bike's chrome and the ambient light on the track all
 * move together — by construction rather than by discipline. It also keeps the
 * download at zero, which matters more than usual: the repo already refuses an
 * HDR download elsewhere and uses RoomEnvironment for the same reason.
 *
 * The catch is that the two uses want different output. What you look at must
 * be tone-mapped and converted to sRGB; what PMREM samples must be raw linear
 * radiance, because tone mapping an environment map bakes a display transform
 * into the lighting and everything lit by it comes out flat. So the fragment
 * shader is assembled with or without those two includes, and nothing else
 * differs between them.
 */

/**
 * Shared ramp evaluation.
 *
 * Accumulated rather than branched: each step mixes toward the next stop by a
 * smoothstep that is 0 below its band and 1 above it, so exactly one term is
 * partial at any height. Algebraically identical to the piecewise lookup in
 * `sampleRamp` (lib/atmosphere.ts), which is what makes the offline PNG
 * preview a true picture of this — but with no early return inside a loop,
 * which some mobile GL drivers compile badly.
 */
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uColors[5];
  uniform float uStops[5];
  uniform vec3 uSunDir;
  uniform float uBiasStrength;
  uniform float uBiasFalloff;
  uniform float uBiasHeightFalloff;
  uniform vec3 uBiasColor;

  varying vec3 vDir;

  vec3 skyRamp(vec3 dir) {
    float h = clamp(dir.y, 0.0, 1.0);

    vec3 col = uColors[0];
    for (int i = 0; i < 4; i++) {
      col = mix(col, uColors[i + 1], smoothstep(uStops[i], uStops[i + 1], h));
    }

    // Azimuth only. Comparing full 3D directions would wrap the lobe around
    // the sun's elevation as well, which reads as a second softer sun rather
    // than as light scattered through more atmosphere near the horizon.
    vec2 dirAz = normalize(dir.xz + vec2(1e-6));
    vec2 sunAz = normalize(uSunDir.xz + vec2(1e-6));
    float facing = (dot(dirAz, sunAz) + 1.0) * 0.5;
    float lobe = pow(facing, uBiasFalloff);
    float lowSky = pow(1.0 - h, uBiasHeightFalloff);

    return mix(col, uBiasColor, lobe * lowSky * uBiasStrength);
  }
`;

export const skyVertexShader = /* glsl */ `
  varying vec3 vDir;

  void main() {
    // The dome is centred on the camera, so object-space position is already
    // the view direction — no need to reconstruct it from the world matrix.
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * @param display `true` for the dome you look at, `false` for the sphere PMREM
 *   samples to build the environment map. See the header.
 */
export function skyFragmentShader(display: boolean): string {
  return /* glsl */ `
    ${RAMP_GLSL}

    void main() {
      gl_FragColor = vec4(skyRamp(normalize(vDir)), 1.0);
      ${
        display
          ? `
      // Mandatory for a ShaderMaterial in three r152+. Without these the dome
      // is the one object in the scene that skips tone mapping and the
      // linear-to-sRGB conversion, and it shows up as a sky that does not
      // match its own fog.
      #include <tonemapping_fragment>
      #include <colorspace_fragment>`
          : `
      // Deliberately raw linear — see the header. No tone mapping here.`
      }
    }
  `;
}

export interface SkyUniforms {
  uColors: { value: THREE.Color[] };
  uStops: { value: number[] };
  uSunDir: { value: THREE.Vector3 };
  uBiasStrength: { value: number };
  uBiasFalloff: { value: number };
  uBiasHeightFalloff: { value: number };
  uBiasColor: { value: THREE.Color };
}

/**
 * @param look which sky. Defaults to the sunset, so every existing caller is
 *   unchanged; `NIGHT_LOOK` is the one Play and Race actually pass.
 */
export function makeSkyUniforms(look: SkyLook = SUNSET_LOOK): SkyUniforms {
  const { colors, stops } = skyRampUniforms(look.stops);
  return {
    uColors: { value: colors },
    uStops: { value: stops },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uBiasStrength: { value: look.biasStrength },
    uBiasFalloff: { value: look.biasFalloff },
    uBiasHeightFalloff: { value: look.biasHeightFalloff },
    // Lighter than any stop in its own ramp, so the bias reads as glow rather
    // than as a shift toward one of the ramp's own colours. Warm for the sun,
    // cool for the moon.
    uBiasColor: { value: new THREE.Color(look.biasColor) },
  };
}

/**
 * Builds the environment map by rendering the gradient into a PMREM.
 *
 * Returns the texture and its disposer. The caller owns both — this allocates
 * a render target and a scene, and neither is reachable from the R3F tree, so
 * nothing else will clean them up.
 */
export function buildSkyEnvironment(
  renderer: THREE.WebGLRenderer,
  sunDir: THREE.Vector3,
  look: SkyLook = SUNSET_LOOK
): { texture: THREE.Texture; dispose: () => void } {
  const uniforms = makeSkyUniforms(look);
  uniforms.uSunDir.value.copy(sunDir);

  const material = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader(false),
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    side: THREE.BackSide,
    depthWrite: false,
  });

  // Radius is irrelevant to the result — PMREM renders six views from the
  // centre and only direction matters — but it must enclose the near plane
  // fromScene uses, so it is not arbitrarily small.
  const geometry = new THREE.SphereGeometry(100, 32, 20);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));

  const pmrem = new THREE.PMREMGenerator(renderer);
  // A little blur, matching what the existing canvases ask of RoomEnvironment.
  // Zero would give mirror-sharp reflections of a gradient that has no detail
  // to be sharp about, and would cost more to generate.
  const target = pmrem.fromScene(scene, 0.04);

  pmrem.dispose();
  geometry.dispose();
  material.dispose();

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
