import type { WorldDoc } from "./worlddoc";
import { parkourWorldDoc } from "./parkour";
import { gardenWorldDoc } from "./garden";

/**
 * Worlds that ship with the game.
 *
 * These are generated from code on request, not stored as rows. That makes
 * them undeletable by construction — there is nothing to DELETE — and it means
 * every player sees the same two worlds without seeding a copy per account.
 *
 * The trade is that they're read-only: PUT and DELETE reject them, and editing
 * happens through Remix, which copies the generated doc into a real row the
 * player owns.
 */

export interface BuiltInWorld {
  slug: string;
  name: string;
  blurb: string;
  /** Accent token name, for the gallery card. */
  accent: "neon" | "mint";
  build(ownerId: string): WorldDoc;
}

export const BUILT_IN_WORLDS: BuiltInWorld[] = [
  {
    slug: "parkour",
    name: "Neon Run",
    blurb: "A forgiving obstacle course. Stones, a walkway, floating islands.",
    accent: "neon",
    build: (ownerId) => parkourWorldDoc("parkour", ownerId, "Neon Run"),
  },
  {
    slug: "garden",
    name: "Quiet Garden",
    blurb: "Hills, a lake and lantern paths. No goal — just somewhere to be.",
    accent: "mint",
    build: (ownerId) => gardenWorldDoc("garden", ownerId, "Quiet Garden"),
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
