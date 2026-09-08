/**
 * Who you play as.
 *
 * Pure data and pure functions on purpose: the room server imports this to
 * check that a joining client's character id is a real one, and it must not
 * pull three.js into a headless process — the same rule `lib/cell-key.ts`
 * exists for.
 *
 * ── The default is not a purchase ────────────────────────────────────────
 *
 * `courier` is the procedural voxel avatar the game has always had. It costs
 * nothing, it is owned by everybody, and it is what an account that has never
 * opened the shop is wearing. It is also the fallback for a character id that
 * no longer exists, so retiring one from the catalog cannot leave anybody
 * invisible.
 */

/**
 * The physics capsule is a 0.3 radius on a 0.3 half-height, so it stands 1.2
 * units tall. Every character is scaled to that rather than to a unit box:
 * an avatar that does not match the capsule it is standing in reads as
 * hovering or as sunk into the floor, whichever way the mismatch goes.
 */
export const CAPSULE_HEIGHT = 1.2;

/**
 * The height of the shared armature, in the units the GLBs were authored in.
 *
 * All three shop characters are the same `Rig_Medium` skeleton with different
 * meshes on it, and `npm run chars:optimize` prints the measured height of
 * each — if a new character reports something other than this, it wants its
 * own `scale` rather than a change here.
 */
const RIG_HEIGHT = 2.166;

export interface Character {
  id: string;
  name: string;
  blurb: string;
  /**
   * Coins. Zero means free and owned from the start — see the note above
   * about `courier`, which is the only one that may be zero.
   */
  price: number;
  /** The GLB, or null for the procedural avatar that needs no download. */
  url: string | null;
  /**
   * Uniform scale that puts the model's head at the top of the capsule. The
   * models are authored with the feet at the origin, so nothing else has to
   * move — see `CharacterRig`.
   */
  scale: number;
  /** Drives the shop card's colour. Not used in the world. */
  accent: string;
}

const scaled = RIG_HEIGHT ? CAPSULE_HEIGHT / RIG_HEIGHT : 1;

export const CHARACTERS: Character[] = [
  {
    id: "courier",
    name: "Courier",
    blurb: "The one you already are. Lit visor, no download.",
    price: 0,
    url: null,
    scale: 1,
    accent: "#22d3ee",
  },
  {
    id: "emberforged-warrior",
    name: "Emberforged Warrior",
    blurb: "Horned helm, banked coals. Built to take a bad landing.",
    price: 500,
    url: "/characters/emberforged-warrior.glb",
    scale: scaled,
    accent: "#f97316",
  },
  {
    id: "voidtouched-mage",
    name: "Voidtouched Mage",
    blurb: "A hat with opinions, and something purple under it.",
    price: 750,
    url: "/characters/voidtouched-mage.glb",
    scale: scaled,
    accent: "#a855f7",
  },
  {
    id: "frostbound-minion",
    name: "Frostbound Minion",
    blurb: "Cold enough to be quiet about it. Rattles on landing.",
    price: 1200,
    url: "/characters/frostbound-minion.glb",
    scale: scaled,
    accent: "#7dd3fc",
  },
];

/** The character every account starts in, and the fallback for anything else. */
export const DEFAULT_CHARACTER = "courier";

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

/** Is this a character the game knows about? The room server's validation. */
export const isCharacterId = (id: unknown): id is string =>
  typeof id === "string" && BY_ID.has(id);

/**
 * The character for an id, never null.
 *
 * A missing id resolves to the courier rather than to nothing, because every
 * caller here is about to draw somebody and "draw nobody" is not an option a
 * renderer can take. An id can go missing for ordinary reasons: an older
 * client, a character retired from the catalog, a hand-edited request.
 */
export const characterFor = (id: string | null | undefined): Character =>
  (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_CHARACTER)!;

/** Everything that has to be bought. The shop's own list. */
export const PURCHASABLE = CHARACTERS.filter((c) => c.price > 0);

/** The price of a character, or null if it is not something you can buy. */
export function priceOf(id: string): number | null {
  const c = BY_ID.get(id);
  return c === undefined || c.price <= 0 ? null : c.price;
}
