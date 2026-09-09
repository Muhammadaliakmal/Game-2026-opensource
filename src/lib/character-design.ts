/**
 * What each character is made of, as numbers.
 *
 * ── Why the roster is code now ───────────────────────────────────────────
 *
 * Three of the four characters were downloaded GLBs of unknown provenance,
 * and a game cannot ship commercially on assets nobody can produce a licence
 * for. That is the one item on the completion spec's list that can block a
 * launch outright rather than merely delay one, and it cannot be fixed by
 * being careful later — it is fixed by owning the art or by not shipping it.
 *
 * It also happened to be the fix for the other complaint about the roster. The
 * Courier is a blocky robot of rounded cubes; the Warrior and the Mage were
 * sculpted low-poly humanoids with cloth and shaded armour. They did not look
 * like the same game, and the shop grid put them next to each other. The
 * platform is called Blockworld and every world in it is made of cubes, so of
 * the two directions on offer the blocky one was always the coherent answer —
 * see the bug report's #21, which says exactly that and leaves the call to us.
 *
 * So: one direction, authored here, owned outright, and free to download.
 *
 * ── The skeleton does not change ─────────────────────────────────────────
 *
 * This describes a SKIN, not a rig. Every design drives the same joint
 * hierarchy the courier already had — the same shoulder and hip offsets, the
 * same `JOINT_Y`, the same `SOLE_Y` — because that hierarchy is a contract
 * with three other systems: `gait.ts` walks it, `character-rig.ts` folds it
 * onto a bike, and ecctrl plants it on the ground. A character that changed
 * proportions would have to be re-checked against all three.
 *
 * What varies is what a player can actually tell apart at ten metres while
 * running: colour, and silhouette. Hence a palette and a small set of additive
 * parts rather than a full parametric body.
 *
 * ── No three.js here ─────────────────────────────────────────────────────
 *
 * The shop's server components read palettes to colour a card, and the room
 * server validates a character id. Neither may pull in three.js — the same
 * rule `lib/sky-stops.ts` exists for.
 */

/**
 * What sits on the head. The main silhouette cue, because a head is what you
 * see of somebody coming towards you over a ridge.
 */
export type Crest = "antenna" | "horns" | "brim" | "spines";

export interface CharacterDesign {
  /** The head and torso. */
  shell: string;
  /** Upper and lower arms. */
  limb: string;
  /** Legs. */
  boot: string;
  /** Pauldrons, brim, horns — whatever hard trim the design has. */
  trim: string;
  /**
   * The lit colour: visor, chest core, and any glowing part.
   *
   * One per character and used everywhere it glows, so a character reads as
   * one thing rather than as a collection of parts that happen to be adjacent.
   * It is also what the shop card and the CurrencyRail tint with, which is why
   * `Character.accent` is derived from it rather than written twice.
   */
  glow: string;
  crest: Crest;
  /** Blocks on the shoulders. Widens the silhouette. */
  pauldrons: boolean;
  /** A block on the back. Changes the profile without touching the front. */
  pack: boolean;
}

/**
 * The roster.
 *
 * Four designs that have to be distinguishable from behind, at speed, on a
 * dark track — which is the only view a player ever gets of their own
 * character. So each one differs in at least two of the three axes available:
 * head shape, shoulder width, and value (light body against dark, or the
 * reverse). Two characters that differ only in hue are two characters nobody
 * can tell apart under Neon Circuit's lighting.
 */
export const DESIGNS: Record<string, CharacterDesign> = {
  /** The one you start as. Light shell, dark limbs, a lit visor. */
  courier: {
    shell: "#e8ecff",
    limb: "#7c3aed",
    boot: "#312e81",
    trim: "#94a3b8",
    glow: "#22d3ee",
    crest: "antenna",
    pauldrons: false,
    pack: false,
  },

  /**
   * Heavy, dark, wide. The inverse of the courier in value as well as in hue,
   * so the two are still distinct in silhouette when both are backlit.
   */
  emberforged: {
    shell: "#3a2419",
    limb: "#6b3410",
    boot: "#241611",
    trim: "#b45309",
    glow: "#f97316",
    crest: "horns",
    pauldrons: true,
    pack: false,
  },

  /**
   * Tall and narrow, and the only one with a horizontal line on its head. A
   * brim is unmistakable from any angle, which is what buys the mage a
   * silhouette without giving it a body shape of its own.
   */
  voidtouched: {
    shell: "#241a3d",
    limb: "#4c1d95",
    boot: "#1e1236",
    trim: "#7c3aed",
    glow: "#a855f7",
    crest: "brim",
    pauldrons: false,
    pack: true,
  },

  /** Pale, spined, and the brightest body in the roster. */
  frostbound: {
    shell: "#cfe6f5",
    limb: "#3b7ea1",
    boot: "#1e3a5f",
    trim: "#7dd3fc",
    glow: "#7dd3fc",
    crest: "spines",
    pauldrons: true,
    pack: false,
  },
};

/** The design for an id, falling back to the courier the way `characterFor` does. */
export function designFor(id: string | null | undefined): CharacterDesign {
  return (id ? DESIGNS[id] : undefined) ?? DESIGNS.courier;
}
