/**
 * Every track the game plays, as data.
 *
 * There used to be one track — the arcade's phonk — at eleven tempos, and the
 * 3D modes played none. A style is the whole arrangement of one genre: kit,
 * groove, bass, harmony and a hook, and `engine.ts` performs any of them on
 * one WebAudio graph. Pure and import-free so the tests can hold every style
 * to the rules below without a browser.
 *
 * ── How the numbers read ─────────────────────────────────────────────────
 *
 * - Sixteen steps to a bar. A pattern is sixteen 0/1 cells.
 * - `root` is semitones from A4 (440 Hz). Everything else is relative to it.
 * - A *degree* indexes `scale`; past the end it climbs an octave, so a riff
 *   can be written as `[0, 2, 4, 5]` over a five-note scale.
 * - `chords` is one chord per bar, as semitone offsets from `root`, and the
 *   bar cycles through them. The bass and the arpeggio follow the chord; the
 *   lead does not, which is why every lead is written in a scale whose notes
 *   sit over every chord of its progression.
 */

export type StyleId = "phonk" | "lofi" | "tabletop" | "synthwave" | "nightrun" | "inferno" | "ambient";

export type LeadVoice = "cowbell" | "bell" | "marimba" | "square" | "keys";
export type BassVoice = "808" | "sub" | "pluck" | "saw";
export type PadVoice = "warm" | "glass" | "keys";
export type SnareVoice = "trap" | "rim" | "clap" | "gated";
export type HatMode = "sixteenth" | "eighth" | "offbeat" | "shaker" | "none";
export type KickTone = "808" | "soft" | "punch";

export interface BassNote {
  step: number;
  /** Scale degree over the bar's chord root, and where it slides to. */
  from: number;
  to: number;
  /** Length in steps. */
  len: number;
  /** Octave offset from the bass's home octave. */
  oct?: number;
}

export interface MusicStyle {
  id: StyleId;
  /** What the player would call it. */
  label: string;
  bpm: number;
  root: number;
  scale: number[];
  /** How late the off-beat sixteenths land, as a fraction of a step. */
  swing: number;
  kickTone: KickTone;
  /** Chosen from every two bars. All zero is a style with no drums. */
  kicks: number[][];
  snares: number[];
  snareVoice: SnareVoice;
  hats: HatMode;
  /** Chance a hat step becomes a roll. */
  hatRoll: number;
  lead: { voice: LeadVoice; riffs: number[][]; octave: number; gain: number } | null;
  bass: { voice: BassVoice; notes: BassNote[] } | null;
  chords: number[][];
  pad: PadVoice | null;
  /** Indices into the bar's chord tones, -1 rests; climbs an octave past the end. */
  arp: { pattern: number[]; octave: number; gain: number } | null;
  /** Vinyl dust, for the lo-fi. */
  crackle: boolean;
  /** Send to the room, 0..1, and to the echo. */
  reverb: number;
  echo: number;
}

const PENTA_MINOR = [0, 3, 5, 7, 10];
const PENTA_MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const Z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/* ── Phonk: the arcade's action cabinets. Unchanged from the original. ── */

export const PHONK_KICKS = [
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
];

export const PHONK_RIFFS = [
  [0, -1, 0, 2, -1, 1, -1, 0, -1, 2, -1, 3, -1, 2, 1, -1],
  [4, -1, 3, -1, 2, -1, 0, -1, 0, -1, 2, 3, -1, 2, -1, -1],
  [0, 0, -1, 3, -1, 2, -1, -1, 4, -1, 3, -1, 2, -1, 1, -1],
  [2, -1, -1, 0, -1, 0, 2, -1, 3, -1, 4, -1, 3, 2, -1, -1],
];

export const PHONK_BASS: BassNote[] = [
  { step: 0, from: 0, to: 0, len: 3.2 },
  { step: 6, from: 0, to: 3, len: 3.2 },
  { step: 10, from: 2, to: 0, len: 3.2 },
];

export const STYLES: Record<StyleId, MusicStyle> = {
  phonk: {
    id: "phonk",
    label: "Phonk",
    bpm: 140,
    root: -15,
    scale: PENTA_MINOR,
    swing: 0,
    kickTone: "808",
    kicks: PHONK_KICKS,
    snares: [8],
    snareVoice: "trap",
    hats: "sixteenth",
    hatRoll: 0.14,
    lead: { voice: "cowbell", riffs: PHONK_RIFFS, octave: 2, gain: 0.16 },
    bass: { voice: "808", notes: PHONK_BASS },
    chords: [[0]],
    pad: null,
    arp: null,
    crackle: false,
    reverb: 0.06,
    echo: 0,
  },

  /* ── Lo-fi: the puzzle cabinets. Swung, dusty, unhurried — a puzzle is
        thinking time, and a beat that leans forward hurries the thinking. ── */
  lofi: {
    id: "lofi",
    label: "Lo-fi",
    bpm: 78,
    root: -19,
    scale: PENTA_MINOR,
    swing: 0.24,
    kickTone: "soft",
    kicks: [
      [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    ],
    snares: [4, 12],
    snareVoice: "rim",
    hats: "eighth",
    hatRoll: 0,
    lead: {
      voice: "bell",
      riffs: [
        [-1, -1, 4, -1, -1, -1, 3, -1, -1, -1, -1, -1, 2, -1, -1, -1],
        [-1, -1, -1, -1, 5, -1, 4, -1, -1, -1, 2, -1, -1, -1, -1, -1],
        Z.map(() => -1),
        [-1, -1, 7, -1, -1, 6, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1],
      ],
      octave: 2,
      gain: 0.06,
    },
    bass: {
      voice: "sub",
      notes: [
        { step: 0, from: 0, to: 0, len: 6 },
        { step: 10, from: 0, to: 0, len: 5 },
      ],
    },
    // i9 – iv7 – ♭VII7 – ♭IIImaj7: the progression half of lo-fi is built on.
    chords: [
      [0, 3, 7, 10, 14],
      [5, 8, 12, 15],
      [-2, 2, 5, 8],
      [3, 7, 10, 14],
    ],
    pad: "keys",
    arp: null,
    crackle: true,
    reverb: 0.28,
    echo: 0.22,
  },

  /* ── Tabletop: the board games. Major, bouncy and polite — a table of
        friends, not a race. ── */
  tabletop: {
    id: "tabletop",
    label: "Tabletop",
    bpm: 112,
    root: -9,
    scale: PENTA_MAJOR,
    swing: 0.14,
    kickTone: "soft",
    kicks: [
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    ],
    snares: [4, 12],
    snareVoice: "clap",
    hats: "shaker",
    hatRoll: 0,
    lead: {
      voice: "marimba",
      riffs: [
        [0, -1, 2, -1, 4, -1, 2, -1, 3, -1, 2, -1, 1, -1, -1, -1],
        [4, -1, 4, 3, -1, 2, -1, -1, 1, -1, 2, -1, 0, -1, -1, -1],
        [2, -1, 3, -1, 4, -1, 5, -1, 4, -1, 2, -1, 3, -1, -1, -1],
        [5, -1, 4, -1, 2, -1, 4, -1, 3, -1, 1, -1, 0, -1, -1, -1],
      ],
      octave: 1,
      gain: 0.13,
    },
    bass: {
      voice: "pluck",
      notes: [
        { step: 0, from: 0, to: 0, len: 2 },
        { step: 6, from: 3, to: 3, len: 2, oct: -1 },
        { step: 8, from: 0, to: 0, len: 2 },
        { step: 14, from: 3, to: 3, len: 2, oct: -1 },
      ],
    },
    // I – vi – IV – V.
    chords: [
      [0, 4, 7],
      [-3, 0, 4],
      [5, 9, 12],
      [7, 11, 14],
    ],
    pad: null,
    arp: null,
    crackle: false,
    reverb: 0.14,
    echo: 0,
  },

  /* ── Synthwave: the race. Four on the floor, an octave-jumping bass and a
        saw arpeggio under a neon sky — the sound of driving at night. ── */
  synthwave: {
    id: "synthwave",
    label: "Synthwave",
    bpm: 118,
    root: -16,
    scale: MINOR,
    swing: 0,
    kickTone: "punch",
    kicks: [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
    snares: [4, 12],
    snareVoice: "gated",
    hats: "offbeat",
    hatRoll: 0,
    lead: null,
    bass: {
      voice: "saw",
      notes: [0, 2, 4, 6, 8, 10, 12, 14].map((step, i) => ({
        step,
        from: 0,
        to: 0,
        len: 1.6,
        oct: i % 2,
      })),
    },
    // i – ♭VI – ♭III – ♭VII.
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
    ],
    pad: "glass",
    arp: { pattern: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3], octave: 1, gain: 0.05 },
    crackle: false,
    reverb: 0.3,
    echo: 0.25,
  },

  /* ── Night run: parkour. Bells falling through a starfield over a
        half-time beat — floating between platforms, not sprinting. ── */
  nightrun: {
    id: "nightrun",
    label: "Night run",
    bpm: 96,
    root: -14,
    scale: MINOR,
    swing: 0.08,
    kickTone: "soft",
    kicks: [
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    ],
    snares: [8],
    snareVoice: "gated",
    hats: "sixteenth",
    hatRoll: 0.05,
    lead: null,
    bass: { voice: "sub", notes: [{ step: 0, from: 0, to: 0, len: 14 }] },
    // i(add9) – ♭VImaj7 – ♭III – ♭VII.
    chords: [
      [0, 3, 7, 14],
      [-4, 0, 3, 7],
      [3, 7, 10, 14],
      [-2, 2, 5, 10],
    ],
    pad: "warm",
    arp: { pattern: [0, 2, 1, 3, 2, 4, 3, 2, 0, 2, 1, 3, 4, 3, 2, 1], octave: 1, gain: 0.055 },
    crackle: false,
    reverb: 0.38,
    echo: 0.3,
  },

  /* ── Inferno: the lava course. Phrygian, distorted and close — the flat
        second is the sound of the floor being lava. ── */
  inferno: {
    id: "inferno",
    label: "Inferno",
    bpm: 150,
    root: -20,
    scale: PHRYGIAN,
    swing: 0,
    kickTone: "808",
    kicks: [
      [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    ],
    snares: [8],
    snareVoice: "trap",
    hats: "sixteenth",
    hatRoll: 0.2,
    lead: {
      voice: "square",
      riffs: [
        [0, -1, 1, -1, 0, -1, -1, 4, -1, 3, -1, 1, -1, 0, -1, -1],
        [4, -1, 5, -1, 4, -1, 3, -1, 1, -1, -1, 0, -1, 1, -1, -1],
        [0, 0, -1, 1, -1, -1, 0, -1, 7, -1, 5, -1, 4, -1, 1, -1],
      ],
      octave: 1,
      gain: 0.06,
    },
    bass: {
      voice: "808",
      notes: [
        { step: 0, from: 0, to: 0, len: 3.2 },
        { step: 6, from: 0, to: 1, len: 3.2 },
        { step: 10, from: 1, to: 0, len: 3.2 },
      ],
    },
    chords: [[0]],
    pad: null,
    arp: null,
    crackle: false,
    reverb: 0.12,
    echo: 0,
  },

  /* ── Ambient: the builder. No drums, slow chords and a bell now and then —
        music for deciding where a block goes. ── */
  ambient: {
    id: "ambient",
    label: "Ambient",
    bpm: 66,
    root: -17,
    scale: PENTA_MAJOR,
    swing: 0,
    kickTone: "soft",
    kicks: [Z],
    snares: [],
    snareVoice: "rim",
    hats: "none",
    hatRoll: 0,
    lead: {
      voice: "bell",
      riffs: [
        [-1, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1],
        Z.map(() => -1),
        [-1, -1, 7, -1, -1, -1, -1, -1, 5, -1, -1, -1, -1, -1, -1, -1],
        Z.map(() => -1),
      ],
      octave: 2,
      gain: 0.05,
    },
    bass: { voice: "sub", notes: [{ step: 0, from: 0, to: 0, len: 15 }] },
    // Imaj7 – IVmaj7 – vi7 – Vsus: no tension anywhere, which is the point.
    chords: [
      [0, 4, 7, 11],
      [5, 9, 12, 16],
      [-3, 0, 4, 7],
      [7, 12, 14, 17],
    ],
    pad: "warm",
    arp: null,
    crackle: false,
    reverb: 0.5,
    echo: 0.35,
  },
};

/** Semitones from A4 for a scale degree, climbing octaves past the scale's end. */
export function degreeSemis(scale: number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  return scale[((degree % n) + n) % n] + 12 * oct;
}

/**
 * Which track a 3D world plays.
 *
 * The lava course gets the inferno; the cottage, which `ambient.ts` already
 * calls cozy, gets the lo-fi; every other course and sandbox is a night run.
 * The race and the builder do not come through here — they are one style
 * each, named where they mount.
 */
export function styleForWorld(worldId: string): StyleId {
  if (worldId === "magma") return "inferno";
  if (worldId === "cottage") return "lofi";
  return "nightrun";
}
