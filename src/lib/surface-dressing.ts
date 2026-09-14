import type { PartTuple, WorldDoc } from "./worlddoc";
import { TEXTURES } from "./texture-list";

/**
 * Surfaces for the worlds that ship, by palette colour.
 *
 * ── Why a map over the finished parts, not a change to every generator ───
 *
 * The built-in worlds were written before surfaces existed, and each names
 * its colours for their ROLE — `GRASS`, `BEAM`, `ASPHALT` — so the colour
 * already says what the block is made of. One map per world, colour to
 * surface, dresses thousands of parts without touching the geometry code, and
 * a world that reads as "grass over dirt over stone" now looks like it.
 *
 * Only matte and metal blocks are dressed. Glossy is glass and water, and
 * the emissive finish is a marker (a lantern, a pad's rim, a goal) that has
 * to stay a clean colour to read as one. A part that already carries a
 * surface keeps it, so a generator can be specific where a colour is shared
 * — the island's tree trunks are the same brown as its soil.
 *
 * Applied at build time in `built-in-worlds.ts`, so a remix inherits the
 * dressing as ordinary parts and can repaint any of it.
 */
export type Dressing = Readonly<Partial<Record<number, string>>>;

const INDEX = new Map(TEXTURES.map((t, i) => [t.name, i]));

/** Surface index for a name, throwing on a typo rather than dressing plain. */
export function surfaceIndex(name: string): number {
  const i = INDEX.get(name);
  if (i === undefined) throw new Error(`no surface named "${name}"`);
  return i;
}

const MATTE = 0;
const METAL = 2;

export function dressParts(parts: PartTuple[], dressing: Dressing): PartTuple[] {
  const byColour = new Map<number, number>();
  for (const [colour, name] of Object.entries(dressing)) {
    if (name) byColour.set(Number(colour), surfaceIndex(name));
  }
  return parts.map((p) => {
    if (p.length > 7 || (p[5] !== MATTE && p[5] !== METAL)) return p;
    const surface = byColour.get(p[4]);
    if (!surface) return p;
    return [p[0], p[1], p[2], p[3], p[4], p[5], p[6], surface];
  });
}

export function dressDoc(doc: WorldDoc, dressing: Dressing): WorldDoc {
  return { ...doc, parts: dressParts(doc.parts, dressing) };
}

/**
 * The outdoor worlds: the island, the yard, the landing page.
 * Palette 23–26 are the greens, 27 the soil brown, 28 the dark stone grey,
 * 29 the pale warm grey the paths and the arch are cut from.
 */
export const NATURAL: Dressing = {
  23: "grass",
  24: "grass",
  25: "grass",
  26: "grass",
  27: "dirt",
  28: "stone",
  29: "cobble",
};

/**
 * The cottage. Its brown is timber, not soil — beams, floorboards, the
 * fence — and its roof is tile, which the brick courses read as.
 */
export const COTTAGE: Dressing = {
  ...NATURAL,
  27: "planks",
  1: "sand", // rendered plaster: a fine even grain, no pattern
  3: "stone", // slate
  10: "brick",
  11: "brick",
};

/**
 * The parkour ladder. Abstract, saturated, edge-lit — so the decks take a
 * paved cobble and the dark neutrals a plate metal, and the glowing rims stay
 * exactly the clean colour the course kit gave them.
 */
export const NEON: Dressing = {
  2: "metal",
  3: "metal",
  4: "metal",
  5: "metal",
  // Every hue a course deck can be, from HUE in course-kit.ts.
  8: "cobble",
  9: "cobble",
  11: "cobble",
  14: "cobble",
  15: "cobble",
  16: "cobble",
  17: "cobble",
  18: "cobble",
  19: "cobble",
  20: "cobble",
  21: "cobble",
  22: "cobble",
  23: "cobble",
  24: "cobble",
  25: "cobble",
  26: "cobble",
  27: "dirt",
  28: "stone",
  29: "stone",
};

/**
 * The race tracks. There is no asphalt in the set; sand's fine, patternless
 * grain tinted the slate of the road IS asphalt at racing speed. Kerbs and
 * lines are painted and stay flat; rails are metal-finished and take plate.
 */
export const TRACK: Dressing = {
  4: "sand",
  5: "sand",
  3: "metal", // the pit apron, metal-finished
  18: "metal", // rails
  27: "dirt",
  28: "stone",
};
