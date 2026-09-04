import type { WorldDoc } from "./worlddoc";
import { parkourWorldDoc } from "./parkour";
import { islandWorldDoc } from "./island";
import { cottageWorldDoc } from "./cottage";
import { circuitWorldDoc } from "./circuit";
import { TIERED_COURSES } from "./courses";
import type { Tier } from "./course-kit";

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
    build: (ownerId) => parkourWorldDoc("parkour", ownerId, "Neon Run"),
  },
  // The rest of the ladder. Kept in `courses.ts` rather than inlined here so
  // the difficulty design and the registry stay separable — this file decides
  // what ships, that one decides what the maps are.
  ...TIERED_COURSES,
  {
    slug: "island",
    name: "Sky Yard",
    blurb: "An island in the void. Trees, an arch, a lantern path. No goal.",
    build: (ownerId) => islandWorldDoc("island", ownerId, "Sky Yard"),
  },
  {
    slug: "cottage",
    name: "The Cottage",
    blurb: "A house you can walk into — and the clearest thing here to remix.",
    build: (ownerId) => cottageWorldDoc("cottage", ownerId, "The Cottage"),
  },
  {
    slug: "circuit",
    name: "Neon Circuit",
    blurb: "A railed loop with nothing to fall off. Hold sprint and go.",
    build: (ownerId) => circuitWorldDoc("circuit", ownerId, "Neon Circuit"),
  },
];

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
