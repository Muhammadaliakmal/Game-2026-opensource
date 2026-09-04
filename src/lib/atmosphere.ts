import * as THREE from "three";
import { NIGHT_STOPS, SKY_STOPS, type SkyStops } from "./sky-stops";

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
// Declared in lib/sky-stops.ts and re-exported here, so this file stays the
// one place a reader looks while the raw data can be imported by server
// components that must not pull three.js in. See that file.
export { SKY_STOPS, NIGHT_STOPS, type SkyStops } from "./sky-stops";

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
export function skyRampUniforms(stops: SkyStops = SKY_STOPS) {
  return {
    colors: stops.map((s) => linear(s.hex)),
    stops: stops.map((s) => s.at),
  };
}

/**
 * Evaluates the ramp on the CPU, in linear space, exactly as the shader does.
 *
 * Used by scripts/render-sky.ts to draw the gradient to a PNG so it can be
 * looked at without a browser, and by the tests. If this and the shader ever
 * disagree, the preview is lying and this is the copy to fix.
 */
export function sampleRamp(
  t: number,
  out = new THREE.Color(),
  ramp: SkyStops = SKY_STOPS
): THREE.Color {
  const h = THREE.MathUtils.clamp(t, 0, 1);
  const { colors, stops } = skyRampUniforms(ramp);

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

/* ------------------------------------------------------------------------
 * Night - the look Play and Race actually run
 * ------------------------------------------------------------------------
 *
 * The sunset above is a complete, coherent piece of work and it stays: it is
 * still what `NEXT_PUBLIC_MAP_V2=1` selects. But the world it lights is a
 * *neon voxel* world, and warm orange light is the one thing that fights that
 * - a glowing cyan rail against a peach sky is two art directions arguing.
 * Against black, the same rail is the brightest thing on screen.
 *
 * Everything below is the same machinery pointed at a different set of
 * numbers: the same five-stop ramp, the same dome shader, the same PMREM, the
 * same follow-light. Only the constants differ, which is the whole reason the
 * sunset was built as constants in one file.
 */

/**
 * A complete sky, as the one object a canvas has to name.
 *
 * The sunset's numbers were loose exports because there was one sky. With two,
 * "which fog goes with which gradient" becomes a question somebody can get
 * wrong, so the answer is a single value that carries both.
 */
export interface SkyLook {
  name: string;
  /** Exactly five stops - the dome shader's ramp loop is unrolled to that. */
  stops: SkyStops;
  /** Horizon colour, and therefore the fog colour. One value, never two. */
  fogHex: string;
  fogDensity: number;
  /** The glow the sky takes on around the light source in it. */
  biasColor: string;
  biasStrength: number;
  biasFalloff: number;
  biasHeightFalloff: number;
  /** How much the generated environment map contributes. */
  envIntensity: number;
  /** Fill light: sky above, ground below. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** The key light - the sun or the moon. Handed to <FollowSun>. */
  keyColor: string;
  keyIntensity: number;
  keyDistance: number;
}

/**
 * The night ramp, bottom to top.
 *
 * "Dark blue to black" literally: a blue that is still recognisably blue at
 * the horizon, and true black overhead. The zenith being black rather than
 * near-black is deliberate and is the opposite of the sunset's rule - there,
 * a black zenith would have read as a bug in the gradient; here it is what
 * lets the stars carry the top of the frame on their own.
 */


/**
 * Where the moon sits, in degrees of elevation and azimuth.
 *
 * Chosen to land exactly where the key light already was, not by taste. Both
 * canvases have always lit this world from `FollowSun`'s DEFAULT_OFFSET —
 * (24, 36, 15), which is 50 degrees up and 32 round — and every course, every
 * block colour and the bike were authored under it. Put the moon anywhere else
 * and you get one of two bad outcomes: either the lighting changes with it and
 * the world is no longer the colour anybody built, or the lighting stays and
 * the shadows stop pointing at the thing casting them.
 *
 * It was 32 up and 128 round, which sounds like a small difference and is not:
 * a flat top face catches sin(32) of the key against sin(50), so every pad,
 * roof and stretch of road lost a third of its light for nothing.
 */
export const MOON_ELEVATION_DEG = 50;
export const MOON_AZIMUTH_DEG = 32;

/** Distance and diameter of the moon billboard. See SUN_SPRITE_DISTANCE. */
export const MOON_SPRITE_DISTANCE = 620;
/**
 * Bigger than the sun's 78, which is not what an astronomer would draw.
 *
 * Every game that has ever put a moon in the sky has drawn it too large,
 * because it is scenery rather than an astronomy lesson: at its true angular
 * size it is a dot nobody notices, and the point of it here is to be the thing
 * you look at when the sky is otherwise empty.
 */
export const MOON_SPRITE_SIZE = 96;

/** Unit vector from the origin toward the moon. */
export function moonDirection(): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(MOON_ELEVATION_DEG);
  const az = THREE.MathUtils.degToRad(MOON_AZIMUTH_DEG);
  return new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az)
  );
}

/* -- Stars ------------------------------------------------------------- */

/**
 * How many, and how big.
 *
 * One draw call whatever the count, so the number is chosen by eye rather than
 * by budget. Thirteen hundred is dense enough to read as a sky and sparse
 * enough that individual stars are still individual - past about three
 * thousand it turns into noise, which is the failure mode every procedural
 * starfield has.
 */
export const STAR_COUNT = 1300;
/** Just inside the dome, so draw order puts them in front of the gradient. */
export const STAR_RADIUS = SKY_RADIUS * 0.9;
/** Pixel sizes, before device pixel ratio. Most stars are the small one. */
export const STAR_SIZE_MIN = 1.0;
export const STAR_SIZE_MAX = 3.4;
/**
 * Stars are not white.
 *
 * A field of pure white points reads as dust on the lens. Real ones scatter
 * from cool blue to warm amber, and that variation is most of what makes a
 * starfield look like a sky rather than a texture.
 */
export const STAR_TINTS = ["#ffffff", "#cfe0ff", "#a9c6ff", "#ffe9c8", "#ffd2a8"];
/** Twinkle rate, radians per second, and how deep the dip goes. */
export const STAR_TWINKLE_SPEED = 1.6;
export const STAR_TWINKLE_DEPTH = 0.38;
/**
 * Fade out near the horizon.
 *
 * Stars sitting on the skyline look pasted on, because in a real sky that is
 * where the atmosphere is thickest and they are dimmest. It is also the band
 * the world's own geometry occupies, so this keeps them out of the way of the
 * thing being played.
 */
export const STAR_HORIZON_FADE = 0.16;

export const NIGHT_LOOK: SkyLook = {
  name: "night",
  stops: NIGHT_STOPS,
  fogHex: NIGHT_STOPS[1].hex,
  /**
   * Thinner than the sunset's 0.0027.
   *
   * Sunset haze is the point of a sunset; night haze just deletes the far side
   * of the track. This puts the wall past CAMERA_FAR, so distance reads as a
   * gentle darkening rather than as a curtain.
   */
  fogDensity: 0.0014,
  /** The moon's own glow bleeding into the sky around it. Cool, and slight. */
  biasColor: "#7e93d8",
  biasStrength: 0.16,
  biasFalloff: 3.2,
  biasHeightFalloff: 0.7,

  /**
   * ── The lighting is the editor's, unchanged, and that is the whole point ──
   *
   * Every value below is exactly what Play and Race were lit with before there
   * was any sky at all. That is the conclusion of getting this wrong twice, not
   * laziness: this world's colours were authored under this rig, so any other
   * rig renders them as different colours — and a voxel game's entire subject
   * is the colours somebody chose block by block.
   *
   * Two failures got us here, and both came from treating "night" as a
   * property of the lighting:
   *
   *  1. A dim blue fill (#4a5da8 at 0.9) that was a SEVENTH of the editor's
   *     once the colour was accounted for, not the four fifths the intensity
   *     number suggested. Everything not facing the moon went black.
   *  2. Correcting that with a bright blue fill (#8ea4e8), which lit the world
   *     properly and painted all of it blue.
   *
   * Night is a property of the BACKGROUND. A black dome, stars, a moon, and
   * fog the colour of the horizon. That is what a night scene is on film: the
   * background tells you the time of day and the subject stays the colour it
   * is. So the sky changed and nothing else did.
   */
  envIntensity: 0.4,
  hemiSky: "#c8d2dd",
  hemiGround: "#1a1d21",
  hemiIntensity: 1.15,
  keyColor: "#ffffff",
  keyIntensity: 1.8,
  keyDistance: 130,
};

/** The sunset, as the same shape, so a canvas can hold either in one variable. */
export const SUNSET_LOOK: SkyLook = {
  name: "sunset",
  stops: SKY_STOPS,
  fogHex: FOG_HEX,
  fogDensity: FOG_DENSITY,
  biasColor: "#FFD8A8",
  biasStrength: SUN_BIAS_STRENGTH,
  biasFalloff: SUN_BIAS_FALLOFF,
  biasHeightFalloff: SUN_BIAS_HEIGHT_FALLOFF,
  envIntensity: ENV_INTENSITY,
  hemiSky: HEMI_SKY_COLOR,
  hemiGround: HEMI_GROUND_COLOR,
  hemiIntensity: HEMI_INTENSITY,
  keyColor: SUN_LIGHT_COLOR,
  keyIntensity: SUN_LIGHT_INTENSITY,
  keyDistance: 130,
};
