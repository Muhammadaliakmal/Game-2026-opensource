import type { Tier } from "./course-kit";
import { RACE } from "./features";
import { RACE_TRACKS } from "./race-track";

/**
 * Every built-in world's name, blurb and tier — and nothing that builds one.
 *
 * `built-in-worlds.ts` pairs each of these with a `build()`, and importing it
 * imports every generator and, through them, zod and the world schema: a
 * 376 KB chunk. Two client components on the front page needed only the
 * names (the daily challenge and the game search), and were shipping and
 * running all of it before the page could respond to a tap. This list is
 * what they read instead.
 *
 * It is a copy, so it is held to the original: `world-list.test.ts` fails
 * if a slug, name, blurb, tier or the ORDER differs from `BUILT_IN_WORLDS`.
 * Order matters beyond tidiness — the daily challenge is
 * `dailyPick(PARKOUR_META)` here and `dailyPick(PARKOUR_COURSES)` in the
 * runs route, and the two must land on the same course.
 */
export interface WorldMeta {
  slug: string;
  name: string;
  blurb: string;
  tier?: Tier;
}

export const WORLD_META: readonly WorldMeta[] = [
  { slug: "parkour", name: "Neon Run", blurb: "A forgiving obstacle course. Stones, a walkway, floating islands.", tier: "Tutorial" },
  { slug: "steps", name: "Harbour Steps", blurb: "A causeway out, a climb, and a long shelf home. Nothing to fall off.", tier: "Tutorial" },
  { slug: "lanterns", name: "Lantern Row", blurb: "A lit street with one turn in it. The route is visible from the start.", tier: "Tutorial" },
  { slug: "meadow", name: "Meadow Rise", blurb: "A long climb to a summit, with two staircases to rest on.", tier: "Tutorial" },
  { slug: "climb", name: "Beacon Climb", blurb: "Four switchback flights to a lit tower. One jump, learned properly.", tier: "Easy" },
  { slug: "spiral", name: "Spiral Yard", blurb: "Two laps of a square helix. A quarter of the jumps are corners.", tier: "Easy" },
  { slug: "bridges", name: "Copper Bridges", blurb: "Long spans between landings, and two descents that open up to three.", tier: "Easy" },
  { slug: "orchard", name: "Sky Orchard", blurb: "A weave with no straight section in it, through unreachable trees.", tier: "Easy" },
  { slug: "gap", name: "Cinder Gap", blurb: "A broken causeway, an S-bend, and a descent that opens up.", tier: "Medium" },
  { slug: "ratchet", name: "Ratchet", blurb: "A climb that changes axis on every hop. No straight line until the top.", tier: "Medium" },
  { slug: "switchyard", name: "Switchback Yard", blurb: "Beacon Climb's tower, with the turn taken on the pad and no deck to walk.", tier: "Medium" },
  { slug: "turnpike", name: "The Turnpike", blurb: "One hard corner, and a plunge on the far side you arrive at already turned.", tier: "Medium" },
  { slug: "narrows", name: "The Narrows", blurb: "Ordinary jumps onto beams one cell wide. Precision, with no clock on it.", tier: "Medium" },
  { slug: "vault", name: "Vault of Wires", blurb: "One-cell walkways and a zigzag that turns on every pad.", tier: "Hard" },
  { slug: "zipline", name: "Zip Line", blurb: "Vault's zigzag as the whole course. Sixteen turns, not one cell of slack.", tier: "Hard" },
  { slug: "gauntlet", name: "The Gauntlet", blurb: "A plunge of six 2x2 pads, banked by one checkpoint at the top of it.", tier: "Hard" },
  { slug: "needle", name: "Needlepoint", blurb: "Every other landing is a 2x1 pad seen end-on. Straight, and unforgiving.", tier: "Hard" },
  { slug: "spindle", name: "Spindle", blurb: "A tower climbed on a widening spiral, with nothing to bank on the way up.", tier: "Hard" },
  { slug: "overclock", name: "Overclock", blurb: "Single-block landings, the whole way. One jump sits on the limit.", tier: "Expert" },
  { slug: "filament", name: "Filament", blurb: "Flat single-cell landings, turning the whole time. One long jump up.", tier: "Expert" },
  { slug: "arclight", name: "Arc Light", blurb: "A single-cell spiral almost straight up, then the whole way back down.", tier: "Expert" },
  { slug: "lattice", name: "Lattice", blurb: "Ninety degrees into a one-cell target every hop, with two plunges to rest.", tier: "Expert" },
  { slug: "magma", name: "Magma Gauntlet", blurb: "Seven stages over a lava sea. Kill walls, a tile floor, a plunge and the needles. Touch the glow and you are back at the checkpoint.", tier: "Obby" },
  { slug: "island", name: "Sky Yard", blurb: "An island in the void. Trees, an arch, a lantern path. No goal." },
  { slug: "cottage", name: "The Cottage", blurb: "A house you can walk into — and the clearest thing here to remix." },
  { slug: "circuit", name: "Neon Circuit", blurb: "A railed loop with nothing to fall off. Hold sprint and go." },
  { slug: "ridge", name: "Vapor Ridge", blurb: "The circuit's shape, up on stilts. A hill on the right, and a crest on the back straight that throws you off the end of it." },
];

const TRACK_SLUGS = new Set<string>(RACE_TRACKS.map((t) => t.slug));

/** The same filters as built-in-worlds.ts, over the same rows. */
export const LISTED_META = WORLD_META.filter((w) => RACE || !TRACK_SLUGS.has(w.slug));
export const PARKOUR_META = LISTED_META.filter((w) => w.tier !== undefined);
