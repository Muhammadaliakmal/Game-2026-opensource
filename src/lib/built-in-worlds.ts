import type { WorldDoc } from "./worlddoc";
import { parkourWorldDoc } from "./parkour";
import { islandWorldDoc } from "./island";
import { cottageWorldDoc } from "./cottage";
import { circuitWorldDoc } from "./circuit";
import { vaporRidgeWorldDoc } from "./vapor-ridge";
import { TIERED_COURSES } from "./courses";
import type { Tier } from "./course-kit";
import { COTTAGE, NATURAL, NEON, TRACK, dressDoc } from "./surface-dressing";

/**
 * Worlds that ship with the game.
 *
 * These are generated from code on request, not stored as rows. That makes
 * them undeletable by construction — there is nothing to DELETE — and it means
 * every player sees the same worlds without seeding a copy per account.
 *
 * The trade is that they're read-only: PUT and DELETE reject them, and editing
 * happens through Remix, which copies the generated doc into a real row the
 * player owns.
 */

export interface BuiltInWorld {
  slug: string;
  name: string;
  blurb: string;
  /**
   * Where this sits in the parkour ladder, if it is in it at all.
   *
   * Optional because most built-ins are not courses: the island and the
   * cottage have nothing to complete, and giving them a difficulty would be
   * claiming a progression they are deliberately outside of.
   */
  tier?: Tier;
  build(ownerId: string): WorldDoc;
}

export const BUILT_IN_WORLDS: BuiltInWorld[] = [
  {
    slug: "parkour",
    name: "Neon Run",
    tier: "Tutorial",
    blurb: "A forgiving obstacle course. Stones, a walkway, floating islands.",
    build: (ownerId) => dressDoc(parkourWorldDoc("parkour", ownerId, "Neon Run"), NEON),
  },
  // The rest of the ladder. Kept in `courses.ts` rather than inlined here so
  // the difficulty design and the registry stay separable — this file decides
  // what ships, that one decides what the maps are.
  // Dressed here rather than in courses.ts for the same reason: what a
  // course is made of is a shipping decision, not a difficulty one.
  ...TIERED_COURSES.map((c) => ({ ...c, build: (ownerId: string) => dressDoc(c.build(ownerId), NEON) })),
  {
    slug: "island",
    name: "Sky Yard",
    blurb: "An island in the void. Trees, an arch, a lantern path. No goal.",
    build: (ownerId) => dressDoc(islandWorldDoc("island", ownerId, "Sky Yard"), NATURAL),
  },
  {
    slug: "cottage",
    name: "The Cottage",
    blurb: "A house you can walk into — and the clearest thing here to remix.",
    build: (ownerId) => dressDoc(cottageWorldDoc("cottage", ownerId, "The Cottage"), COTTAGE),
  },
  {
    slug: "circuit",
    name: "Neon Circuit",
    blurb: "A railed loop with nothing to fall off. Hold sprint and go.",
    build: (ownerId) => dressDoc(circuitWorldDoc("circuit", ownerId, "Neon Circuit"), TRACK),
  },
  {
    slug: "ridge",
    name: "Vapor Ridge",
    blurb:
      "The circuit's shape, up on stilts. A hill on the right, and a crest on " +
      "the back straight that throws you off the end of it.",
    build: (ownerId) => dressDoc(vaporRidgeWorldDoc("ridge", ownerId, "Vapor Ridge"), TRACK),
  },
];

/**
 * The parkour ladder, in tier order, and everything else.
 *
 * `tier` is already what separates the two: a course has a difficulty because
 * it has a goal to be difficult about, and the island, the cottage and the
 * walkable circuit deliberately have neither. Splitting on it here means the
 * menu cannot disagree with the registry — adding a fifth course to
 * `TIERED_COURSES` puts it on the parkour screen and nowhere else, with no
 * second list to remember to update.
 */
export const PARKOUR_COURSES: BuiltInWorld[] = BUILT_IN_WORLDS.filter(
  (w) => w.tier !== undefined
);

/** The worlds with nothing to complete. Somewhere to stand and build. */
export const SANDBOX_WORLDS: BuiltInWorld[] = BUILT_IN_WORLDS.filter(
  (w) => w.tier === undefined
);

const BY_SLUG = new Map(BUILT_IN_WORLDS.map((w) => [w.slug, w]));

/**
 * Note this must be checked before any DB lookup: the `worlds.id` column is a
 * uuid, and handing Postgres the string "parkour" is an error, not a miss.
 */
export function isBuiltInWorld(id: string): boolean {
  return BY_SLUG.has(id);
}

export function getBuiltInWorld(id: string): BuiltInWorld | undefined {
  return BY_SLUG.get(id);
}

/** The generated doc, owned by whoever asked for it. */
export function buildBuiltInDoc(id: string, ownerId: string): WorldDoc | null {
  const world = BY_SLUG.get(id);
  return world ? world.build(ownerId) : null;
}
