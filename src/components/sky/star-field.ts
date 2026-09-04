import * as THREE from "three";
import {
  STAR_COUNT,
  STAR_HORIZON_FADE,
  STAR_RADIUS,
  STAR_SIZE_MAX,
  STAR_SIZE_MIN,
  STAR_TINTS,
  STAR_TWINKLE_DEPTH,
  STAR_TWINKLE_SPEED,
  linear,
} from "@/lib/atmosphere";

/**
 * The starfield's geometry and shaders, with no React in them.
 *
 * Split out of the component for the same reason `sky-shader.ts` is split out
 * of `SkyDome`: this is buffer arithmetic and GLSL, none of it has anything to
 * do with rendering a component, and it is the half worth being able to reason
 * about — or test — on its own.
 *
 * It is also what the lint rules require. `react-hooks/purity` rejects
 * `Math.random()` reached from render, and a `useMemo` factory is render;
 * `react-hooks/immutability` rejects writing to an object literal a hook
 * returned. Both are satisfied by building these here and letting the
 * component treat the results as opaque values it was handed — which is
 * exactly what the rules are asking for, rather than a way around them.
 */

/**
 * A soft round dot.
 *
 * A square point sprite is instantly readable as a bug, and `gl_PointCoord`
 * with a smoothstep is cheaper than shipping a texture for something four
 * pixels across. Tight core, wide faint skirt — so a bright star reads as a
 * point with a halo rather than as a blob.
 */
export const STAR_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.55, r);
    float halo = (1.0 - smoothstep(0.0, 1.0, r)) * 0.35;
    gl_FragColor = vec4(vTint, vAlpha * (core + halo));
  }
`;

/**
 * The twinkle lives here rather than in JS.
 *
 * Rewriting an alpha attribute for every star every frame is thirteen hundred
 * float writes plus a buffer re-upload, sixty times a second, to animate
 * something nobody looks at directly. A per-star phase baked into the geometry
 * once and a single `uTime` uniform gets the same result for one uniform
 * write — and because the phases are random and fixed, no two stars pulse
 * together, which is what stops a synchronised twinkle reading as mechanical.
 */
export const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aTint;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkleSpeed;
  uniform float uTwinkleDepth;
  uniform float uHorizonFade;

  varying float vAlpha;
  varying vec3 vTint;

  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    float twinkle =
      1.0 - uTwinkleDepth * (0.5 + 0.5 * sin(uTime * uTwinkleSpeed + aPhase));

    // Height up the dome. The cloud is centred on the camera, so object-space
    // position is already the view direction — no world matrix needed.
    float h = normalize(position).y;
    float horizon = smoothstep(0.0, uHorizonFade, h);

    vAlpha = twinkle * horizon;
    vTint = aTint;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

export interface StarUniforms {
  uTime: { value: number };
  uPixelRatio: { value: number };
  uTwinkleSpeed: { value: number };
  uTwinkleDepth: { value: number };
  uHorizonFade: { value: number };
}

export function makeStarUniforms(): StarUniforms {
  return {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uTwinkleSpeed: { value: STAR_TWINKLE_SPEED },
    uTwinkleDepth: { value: STAR_TWINKLE_DEPTH },
    uHorizonFade: { value: STAR_HORIZON_FADE },
  };
}

/**
 * The whole field, in one buffer.
 *
 * Upper hemisphere only: there is no sky below the horizon, there is a world
 * down there, so the other half would be points drawn behind the ground for
 * nothing.
 *
 * @param random injectable so a test can pin the layout. Defaults to
 *   `Math.random`, which is what actually runs.
 */
export function makeStarGeometry(random: () => number = Math.random) {
  const pos = new Float32Array(STAR_COUNT * 3);
  const size = new Float32Array(STAR_COUNT);
  const phase = new Float32Array(STAR_COUNT);
  const tint = new Float32Array(STAR_COUNT * 3);
  const tints = STAR_TINTS.map((hex) => linear(hex));

  for (let i = 0; i < STAR_COUNT; i++) {
    // Even over the hemisphere: height first, then the radius that height
    // implies, then an even azimuth. Picking a height linearly and a radius
    // independently is what crowds a naive starfield at the pole.
    const y = random();
    const r = Math.sqrt(1 - y * y);
    const a = random() * Math.PI * 2;
    pos[i * 3 + 0] = Math.cos(a) * r * STAR_RADIUS;
    pos[i * 3 + 1] = y * STAR_RADIUS;
    pos[i * 3 + 2] = Math.sin(a) * r * STAR_RADIUS;

    // Cubed, so most stars sit near the minimum and a bright one is genuinely
    // rare. A uniform size distribution reads as gravel.
    const t = random();
    size[i] = STAR_SIZE_MIN + (STAR_SIZE_MAX - STAR_SIZE_MIN) * t * t * t;
    phase[i] = random() * Math.PI * 2;

    const c = tints[Math.min(tints.length - 1, (random() * tints.length) | 0)];
    tint[i * 3 + 0] = c.r;
    tint[i * 3 + 1] = c.g;
    tint[i * 3 + 2] = c.b;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  g.setAttribute("aTint", new THREE.BufferAttribute(tint, 3));
  // Welded to the camera and never culled, so the bounding sphere three would
  // otherwise compute is work for an answer nothing consults.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_RADIUS);
  return g;
}

/**
 * The per-frame write, as a function rather than two assignments at the call
 * site.
 *
 * That is not style. `react-hooks/immutability` forbids assigning to a member
 * of a value a hook returned, and the uniforms come out of a `useMemo` — so
 * the mutation belongs here, where the uniforms are an ordinary parameter,
 * exactly as their construction does. `SkyDome` gets away with it only
 * because `Vector3.copy()` is a method call.
 */
export function advanceStars(
  u: StarUniforms,
  timeSeconds: number,
  pixelRatio: number
) {
  u.uTime.value = timeSeconds;
  u.uPixelRatio.value = pixelRatio;
}
