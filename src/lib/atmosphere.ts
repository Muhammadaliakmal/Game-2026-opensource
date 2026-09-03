import * as THREE from "three";

/**
 * Every number that decides what the sky looks like, in one file.
 *
 * MAP.md §12 asks that a reviewer be able to change fog, sun angle and density
 * in one place. This is that place. Nothing in components/sky/* declares a
 * colour or an angle of its own — if you find one there, it belongs here.
 *
 * ── Unit convention ──────────────────────────────────────────────────────
 *
 * 1 world unit = 1 metre, matching MAP.md §2. Neon Circuit's lap is ~530 units,
 * so the whole circuit fits inside a 260 m box — this is a compact track, not
 * the 12 km highway the spec describes, and the distances below are sized for
 * what is actually here rather than copied across.
 *
 * ── Baseline, recorded before any of this existed ────────────────────────
 *
 * NOT MEASURED. MAP.md §1 asks for FPS and renderer.info during a lap as the
 * reference every later performance claim is judged against. Taking it needs a
 * browser attached to a running room server, which was not available. Every
 * budget in MAP.md §10 is therefore currently unverified against this scene,
 * and the first person with a browser should fill this in:
 *
 *   FPS (lap, desktop):        ?
 *   renderer.info.render.calls:      ?
 *   renderer.info.render.triangles:  ?
 *   renderer.info.memory.geometries: ?
 *   renderer.info.memory.textures:   ?
 *   renderer.info.programs.length:   ?   // MAP.md §10.1: stop at ~40
 */

/* ────────────────────────────────────────────────────────────────────────
 * The sky gradient
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The sunset ramp, bottom to top, as MAP.md §4.2 specifies it.
 *
 * `at` is normalised height up the dome: 0 at the horizon, 1 at the zenith.
 *
 * These are authored in sRGB because that is how anyone reasoning about colour
 * thinks, and converted to linear working space exactly once, below. Lerping
 * sRGB values directly is what MAP.md warns turns the mid-tones muddy: the
 * midpoint of two sRGB numbers is not the colour halfway between the two
 * lights they represent.
 */
export const SKY_STOPS = [
  { at: 0.0, hex: "#FFC28A", note: "horizon — bright, slightly desaturated" },
  { at: 0.1, hex: "#F2A277", note: "lower — THIS IS THE FOG COLOUR" },
  { at: 0.28, hex: "#C6577A", note: "mid — rose" },
  { at: 0.55, hex: "#5B4A8A", note: "upper — the transition that sells it" },
  { at: 1.0, hex: "#1B2A5B", note: "zenith — deep indigo, never black" },
] as const;

/**
 * The horizon colour, and therefore the fog colour.
 *
 * MAP.md §3.1 is emphatic that these must be the same value: if they differ by
 * more than a hair you get a visible seam where the world ends, and that seam
 * is the single most common reason a browser 3D scene reads as fake. They are
 * the same value here because it is the same constant, not because someone
 * copied a hex string into two files and kept them in step.
 */
export const FOG_HEX = SKY_STOPS[1].hex;

/**
 * How far round the dome the sun's warmth spreads, and how strong it is.
 *
 * A real sky is not radially symmetric — it is brighter on the sun's side. Two
 * numbers rather than one because the falloff and the amount are independently
 * wrong-looking: too tight reads as a second sun, too strong flattens the ramp.
 */
export const SUN_BIAS_STRENGTH = 0.42;
export const SUN_BIAS_FALLOFF = 2.0;
/**
 * How far up the dome the bias reaches.
 *
 * This started at 2.0, which confined the warmth to the bottom of the sky —
 * where the ramp is already warm, so it did nothing visible and the sky was
 * symmetric after all. The glow wants to bleed up into the rose band, which is
 * where a real sunset's asymmetry actually shows.
 */
export const SUN_BIAS_HEIGHT_FALLOFF = 1.15;

/**
 * Radius of the inverted sphere the gradient is painted on.
 *
 * MAP.md §4.2 says 4000, which cannot work here and is worth explaining rather
 * than silently changing. A vertex at 4000 is far outside CAMERA_FAR, so the
 * dome would be clipped away entirely and the sky would render as nothing.
 * The spec's own §3.1 sets `far` to 1600, which has the same problem — it is
 * an internal inconsistency in the spec, not a mistake in the port.
 *
 * The fix is the one every engine uses: the sky follows the camera, so it is
 * always the same distance away and can sit comfortably inside the far plane.
 * Everything in components/sky/ is anchored to the camera for this reason, and
 * "distance" between the layers is therefore only a drawing order — the sense
 * of depth comes from parallax in the drift, not from real separation.
 */
export const SKY_RADIUS = 700;

/* ────────────────────────────────────────────────────────────────────────
 * The sun
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Elevation above the horizon, degrees. MAP.md §4.3.
 *
 * Higher and the long shadows go; lower and the directional light stops
 * reaching the road surface at all and the track goes flat.
 */
export const SUN_ELEVATION_DEG = 7;

/**
 * Azimuth, degrees, measured from +X toward +Z.
 *
 * Neon Circuit's start/finish straight runs along +X (race-track.ts: riders
 * face +X on the grid), so this puts the sun ahead and a little left as the
 * lights go out — which is the whole point of choosing this atmosphere.
 */
export const SUN_AZIMUTH_DEG = 24;

/**
 * How far the sun drifts over a race, degrees of azimuth per minute.
 *
 * Deliberately tiny. MAP.md §4.3: something must always be moving, but a sun
 * that visibly tracks across the sky during a three-lap race reads as a bug.
 */
export const SUN_DRIFT_DEG_PER_MIN = 0.35;

/**
 * Distance the visible sun billboard sits from the CAMERA, not the origin.
 *
 * Inside SKY_RADIUS so it draws in front of the dome, and inside CAMERA_FAR so
 * it is not clipped — see the note on SKY_RADIUS.
 */
export const SUN_SPRITE_DISTANCE = 640;
/** Diameter of the billboard, world units at that distance. */
export const SUN_SPRITE_SIZE = 78;

/** Unit vector from the origin toward the sun, for a given drift in degrees. */
export function sunDirection(driftDeg = 0): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(SUN_ELEVATION_DEG);
  const az = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG + driftDeg);
  return new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az)
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Lighting — MAP.md §5, deliberately three sources and no more
 * ──────────────────────────────────────────────────────────────────────── */

export const SUN_LIGHT_COLOR = "#FFB877";
export const SUN_LIGHT_INTENSITY = 2.4;

export const HEMI_SKY_COLOR = "#FF8C42";
export const HEMI_GROUND_COLOR = "#2A2118";
export const HEMI_INTENSITY = 0.55;

/**
 * How much the image-based lighting contributes.
 *
 * The existing canvases run RoomEnvironment at 0.4 — a neutral grey box, which
 * is why the chrome on a bike currently reflects nothing that belongs to this
 * world. Raised here because the environment is now the sunset itself.
 */
export const ENV_INTENSITY = 0.8;

/* ────────────────────────────────────────────────────────────────────────
 * Camera and fog — MAP.md §3.1 says set these together, so they are together
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `near` was three.js's default 0.1, which spends depth precision on the 20 cm
 * in front of the lens where nothing is ever drawn. The chase camera sits 6.5
 * units back from a bike about 2 units long, so nothing is ever closer than
 * this.
 */
export const CAMERA_NEAR = 0.3;

/**
 * `far` was three.js's default 2000.
 *
 * MAP.md §3.1 asks for 1600 against a 12 km highway. Neon Circuit's whole
 * bounding box is ~260 m, so 1600 would be almost entirely empty space bought
 * with depth precision. 900 clears the far side of the circuit and the sea
 * beyond it with room to spare.
 */
export const CAMERA_FAR = 900;

/**
 * FogExp2 density, tuned so fog reaches full occlusion just inside `far`.
 *
 * exp(-(d*x)^2) falls below 1% at roughly d = 2.15/x, so 0.0027 puts the wall
 * at ~800 units — inside CAMERA_FAR, which is the ordering that matters. Get
 * it the wrong way round and geometry visibly pops out of existence at the far
 * plane instead of fading.
 */
export const FOG_DENSITY = 0.0027;

/* ────────────────────────────────────────────────────────────────────────
 * The sea — MAP.md §4.4
 * ──────────────────────────────────────────────────────────────────────── */

/** Sits just below the circuit, whose racing surface tops out at y = 1. */
export const SEA_LEVEL = -1.5;
export const SEA_EXTENT = 6000;

export const SEA_COLOR = "#12203E";
export const SEA_METALNESS = 0.9;
export const SEA_ROUGHNESS = 0.15;

/** Two normal layers at different scales and opposing drift, per MAP.md §4.4. */
export const SEA_WAVE_A = { repeat: 220, speed: 0.011, angle: 0.0 };
export const SEA_WAVE_B = { repeat: 90, speed: -0.006, angle: 1.1 };

/**
 * The sun glitter path — MAP.md calls this the highest-value forty lines in the
 * document, and it is right. It is the thing that makes a flat plane read as
 * water rather than as blue lino.
 */
export const GLITTER_COLOR = "#FFD9A0";
export const GLITTER_INTENSITY = 0.85;
/** How far the streak spreads across the water, radians of azimuth. */
export const GLITTER_SPREAD = 0.09;

/* ────────────────────────────────────────────────────────────────────────
 * Clouds — MAP.md §4.2 layer 3
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Two layers, because the parallax between them is what creates sky depth.
 * One layer looks like wallpaper — and MAP.md's own trade-off note applies:
 * these are wrong if the camera ever looks straight up, which a chase camera
 * welded behind a bike never does.
 */
export const CLOUD_LAYERS = [
  {
    name: "cirrus",
    y: 900,
    size: 7000,
    repeat: 3,
    driftMps: 0.6,
    opacity: 0.35,
    color: "#FFD0A8",
  },
  {
    name: "cumulus",
    y: 350,
    size: 4600,
    repeat: 2,
    driftMps: 1.8,
    opacity: 0.6,
    color: "#E08A6A",
  },
] as const;

/* ────────────────────────────────────────────────────────────────────────
 * Colour helpers
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * An sRGB hex string as a linear-working-space THREE.Color.
 *
 * three's ColorManagement has been on by default since r152, so the constructor
 * already does this conversion — this exists to make the intent explicit at
 * every call site, because "is this value linear yet" is the question that
 * makes gradients muddy when nobody can answer it.
 */
export function linear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** The ramp as flat arrays, ready to hand to a shader as uniforms. */
export function skyRampUniforms() {
  return {
    colors: SKY_STOPS.map((s) => linear(s.hex)),
    stops: SKY_STOPS.map((s) => s.at),
  };
}

/**
 * Evaluates the ramp on the CPU, in linear space, exactly as the shader does.
 *
 * Used by scripts/render-sky.ts to draw the gradient to a PNG so it can be
 * looked at without a browser, and by the tests. If this and the shader ever
 * disagree, the preview is lying and this is the copy to fix.
 */
export function sampleRamp(t: number, out = new THREE.Color()): THREE.Color {
  const h = THREE.MathUtils.clamp(t, 0, 1);
  const { colors, stops } = skyRampUniforms();

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (h > b) continue;
    const k = b === a ? 0 : (h - a) / (b - a);
    // Smoothstep rather than linear: a straight lerp between five stops shows
    // a visible crease at each one, and the sky is the one surface on screen
    // where a crease has nothing to hide behind.
    const s = k * k * (3 - 2 * k);
    return out.copy(colors[i]!).lerp(colors[i + 1]!, s);
  }
  return out.copy(colors[colors.length - 1]!);
}
