import * as THREE from "three";
import {
  NIGHT_LOOK,
  SUNSET_LOOK,
  moonDirection,
  sampleRamp,
} from "@/lib/atmosphere";
import { PALETTE } from "@/lib/worlddoc";
import { FINISH_PARAMS } from "@/components/editor/shapes";

/**
 * What a surface actually renders as, without a browser.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The first night pass shipped a world nobody could see. The reasoning that
 * produced it compared `hemiIntensity: 0.9` against the editor's `1.15` and
 * concluded "a little dimmer" — ignoring that nearly all of a light's output
 * is in its COLOUR, and that #4a5da8 is about a sixth of #c8d2dd once both are
 * linear. The real fill was a seventh of the editor's, not four fifths.
 *
 * That mistake is arithmetic, so it is catchable by arithmetic. This walks the
 * same maths three.js does — hemisphere irradiance, a Lambert key, an
 * environment term for metals, then ACES and the sRGB transfer — and prints
 * what a given palette colour and finish comes out as under each look.
 *
 * Run: `npm run light:check`
 */

// ── The renderer's own two transforms, in the order it applies them ───────

/** three's ACESFilmicToneMapping, verbatim from three/src/renderers/shaders. */
function aces(x: number, exposure = 1.05): number {
  let c = x * exposure * 0.6;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return Math.min(1, Math.max(0, c));
}

/** Linear-to-sRGB, so the number printed is the one a colour picker reads. */
function toSRGB(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

const hex = (rgb: [number, number, number]) =>
  "#" + rgb.map((c) => toSRGB(aces(c)).toString(16).padStart(2, "0")).join("");

/** Perceived lightness of the tone-mapped result, 0..1. Rec. 709 luma. */
const luma = (rgb: [number, number, number]) =>
  0.2126 * aces(rgb[0]) + 0.7152 * aces(rgb[1]) + 0.0722 * aces(rgb[2]);

// ── The light itself ──────────────────────────────────────────────────────

type V3 = [number, number, number];
const lin = (h: string): V3 => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

/**
 * Hemisphere irradiance on a surface, exactly as three computes it:
 * a straight mix between ground and sky on the normal's Y.
 */
function hemi(sky: string, ground: string, intensity: number, ny: number): V3 {
  const s = lin(sky);
  const g = lin(ground);
  const t = 0.5 * ny + 0.5;
  return [
    (g[0] + (s[0] - g[0]) * t) * intensity,
    (g[1] + (s[1] - g[1]) * t) * intensity,
    (g[2] + (s[2] - g[2]) * t) * intensity,
  ];
}

/**
 * Average radiance of the environment probe.
 *
 * The probe is a PMREM of the same dome the player looks at, so its irradiance
 * is the ramp integrated over the sphere. A cosine-weighted sum over height is
 * close enough to compare two looks against each other, which is all this is
 * for — the lower half of the sphere sees the ramp's own horizon value, since
 * the dome is a full sphere and the ramp clamps below y=0.
 */
function envAverage(stops: typeof NIGHT_LOOK.stops): V3 {
  const out: V3 = [0, 0, 0];
  const N = 64;
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const y = (i + 0.5) / N;
    sampleRamp(y, c, stops);
    out[0] += c.r;
    out[1] += c.g;
    out[2] += c.b;
  }
  // Half the sphere is below the horizon and sits at the clamped bottom stop.
  sampleRamp(0, c, stops);
  return [
    (out[0] / N + c.r) / 2,
    (out[1] / N + c.g) / 2,
    (out[2] / N + c.b) / 2,
  ];
}

interface Look {
  name: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyDir: THREE.Vector3;
  envIntensity: number;
  envAvg: V3;
}

/** What the editor and Play used before any of this. The reference point. */
const BUILD: Look = {
  name: "build (studio)",
  hemiSky: "#c8d2dd",
  hemiGround: "#1a1d21",
  hemiIntensity: 1.15,
  keyColor: "#ffffff",
  keyIntensity: 1.8,
  keyDir: new THREE.Vector3(24, 36, 15).normalize(),
  // RoomEnvironment: a neutral grey box. ~0.35 linear is the value that
  // reproduces how a `metal` block reads in the editor.
  envIntensity: 0.4,
  envAvg: [0.35, 0.35, 0.35],
};

const NIGHT: Look = {
  name: "night",
  hemiSky: NIGHT_LOOK.hemiSky,
  hemiGround: NIGHT_LOOK.hemiGround,
  hemiIntensity: NIGHT_LOOK.hemiIntensity,
  keyColor: NIGHT_LOOK.keyColor,
  keyIntensity: NIGHT_LOOK.keyIntensity,
  keyDir: moonDirection().normalize(),
  envIntensity: NIGHT_LOOK.envIntensity,
  envAvg: envAverage(NIGHT_LOOK.stops),
};

const SUNSET: Look = {
  name: "sunset",
  hemiSky: SUNSET_LOOK.hemiSky,
  hemiGround: SUNSET_LOOK.hemiGround,
  hemiIntensity: SUNSET_LOOK.hemiIntensity,
  keyColor: SUNSET_LOOK.keyColor,
  keyIntensity: SUNSET_LOOK.keyIntensity,
  keyDir: new THREE.Vector3(0.98, 0.12, 0.14).normalize(),
  envIntensity: SUNSET_LOOK.envIntensity,
  envAvg: envAverage(SUNSET_LOOK.stops),
};

/**
 * A shaded pixel.
 *
 * Metalness splits the two paths the way three does: a metal has no diffuse
 * term at all and is lit only by the environment, tinted by its base colour —
 * which is the whole reason a night probe at daylight intensities renders
 * every chrome rail black.
 */
function shade(
  look: Look,
  colorIndex: number,
  finish: number,
  normal: THREE.Vector3
): V3 {
  const albedo = lin(PALETTE[colorIndex]);
  const p = FINISH_PARAMS[finish];
  const nl = Math.max(0, normal.dot(look.keyDir));

  const irr = hemi(look.hemiSky, look.hemiGround, look.hemiIntensity, normal.y);
  const key = lin(look.keyColor);
  const env = look.envAvg;

  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const direct = key[i] * look.keyIntensity * nl;
    const diffuse = albedo[i] * (irr[i] + direct) * (1 - p.metalness);
    // Metals tint what they reflect; dielectrics add a much weaker white
    // specular that is not worth modelling for a legibility check.
    const metal = albedo[i] * env[i] * look.envIntensity * p.metalness;
    const emissive = albedo[i] * p.emissiveIntensity;
    out[i] = diffuse + metal + emissive;
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Facing away from the moon: the worst case, and where black first appears. */
const AWAY = moonDirection().clone().negate().setY(0).normalize();

const FINISHES = ["matte", "glossy", "metal", "emissive"];

/** The surfaces that actually decide whether the game is playable. */
const CASES: { what: string; color: number; finish: number }[] = [
  // The two the road alternates between, per circuit.ts. Keep these in step
  // with ASPHALT / ASPHALT_DARK there — they are the whole reason this exists.
  { what: "road (dark band)", color: 4, finish: 0 },
  { what: "road (light band)", color: 3, finish: 0 },
  { what: "rail (metal)", color: 18, finish: 2 },
  { what: "kerb (glossy)", color: 11, finish: 1 },
  { what: "parkour pad (indigo)", color: 18, finish: 0 },
  { what: "parkour pad (cyan)", color: 21, finish: 1 },
  { what: "glow rim", color: 21, finish: 3 },
];

/**
 * The bike, which is not made of palette blocks and so needs its own case.
 *
 * Half metal, which is the reason it is here: at metalness 0.5 the
 * environment supplies half its light, and a black probe took half the bike
 * with it.
 */
const BIKE = { color: "#22d3ee", metalness: 0.5 };

function shadeBike(look: Look, normal: THREE.Vector3): V3 {
  const albedo = lin(BIKE.color);
  const nl = Math.max(0, normal.dot(look.keyDir));
  const irr = hemi(look.hemiSky, look.hemiGround, look.hemiIntensity, normal.y);
  const key = lin(look.keyColor);
  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const direct = key[i] * look.keyIntensity * nl;
    out[i] =
      albedo[i] * (irr[i] + direct) * (1 - BIKE.metalness) +
      albedo[i] * look.envAvg[i] * look.envIntensity * BIKE.metalness;
  }
  return out;
}

const looks = [BUILD, NIGHT, SUNSET];

console.log("Environment probe average (linear):");
for (const l of looks) {
  console.log(
    `  ${l.name.padEnd(16)} ${l.envAvg.map((v) => v.toFixed(4)).join(", ")}` +
      `  x${l.envIntensity} = ${l.envAvg
        .map((v) => (v * l.envIntensity).toFixed(3))
        .join(", ")}`
  );
}

for (const normal of [
  { name: "top face (up)", n: UP },
  { name: "side facing away from the key", n: AWAY },
]) {
  console.log(`\n── ${normal.name} ${"─".repeat(40 - normal.name.length)}`);
  console.log(
    "  " +
      "surface".padEnd(24) +
      looks.map((l) => l.name.padEnd(18)).join("")
  );
  for (const c of CASES) {
    const row = looks.map((l) => {
      const v = shade(l, c.color, c.finish, normal.n);
      return `${hex(v)} L${luma(v).toFixed(2)}`.padEnd(18);
    });
    console.log(
      "  " + `${c.what} [${FINISHES[c.finish]}]`.padEnd(24) + row.join("")
    );
  }
  console.log(
    "  " +
      "bike paint [half metal]".padEnd(24) +
      looks
        .map((l) => {
          const v = shadeBike(l, normal.n);
          return `${hex(v)} L${luma(v).toFixed(2)}`.padEnd(18);
        })
        .join("")
  );
}

/**
 * The one number worth failing on.
 *
 * A surface below this is not "moody", it is gone: the edge of a platform
 * cannot be told from the void behind it, which on a parkour course is a
 * difficulty nobody chose. 0.02 is about where an 8-bit sRGB value stops being
 * distinguishable from black on an ordinary screen in a lit room.
 *
 * Judged on the TOP face only. A vertical wall facing away from the moon is
 * meant to be near black — that is what a directional key light is for — and
 * failing on it would be failing on the look working.
 */
const FLOOR = 0.02;

/**
 * The road's dark band is exempt, and only the dark band.
 *
 * The racing surface alternates two slates to give the camber something to
 * read against. The dark one is not a surface you look at on its own; it is
 * the shadow half of a pattern whose light half is checked like everything
 * else. Exempting the pair would hide a black road, so the light band carries
 * the test.
 */
const EXEMPT = new Set(["road (dark band)"]);

const judged = CASES.filter((c) => !EXEMPT.has(c.what)).map((c) => ({
  what: c.what,
  l: luma(shade(NIGHT, c.color, c.finish, UP)),
}));
judged.push({ what: "bike paint", l: luma(shadeBike(NIGHT, UP)) });
judged.sort((a, b) => a.l - b.l);

const worst = judged[0];
const ok = worst.l >= FLOOR;
console.log(
  `
Darkest lit night surface: ${worst.what} at L${worst.l.toFixed(3)} ` +
    `(floor ${FLOOR}) — ${ok ? "OK" : "TOO DARK"}`
);
if (!ok) process.exitCode = 1;
