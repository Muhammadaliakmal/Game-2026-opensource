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

import { DESIGNS } from "./character-design";

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

/**
 * The scale a rigged GLB would need. Nothing uses it while the roster is
 * procedural — see the note under CHARACTERS — and it is kept, exported, so
 * adding a licensed model back is one catalogue row rather than a rediscovery
 * of why 2.166 is the number.
 */
export const GLB_SCALE = RIG_HEIGHT ? CAPSULE_HEIGHT / RIG_HEIGHT : 1;

/**
 * ── What a price actually means ──────────────────────────────────────────
 *
 * A price is not a number of coins, it is a number of DAYS. `DAILY_SOFT_CAP`
 * in `lib/arcade-payout.ts` is 500: past it a run pays a fifth, so 500 a day
 * is what a player who is enjoying themselves actually banks. Every price
 * here should be read as a division by that.
 *
 * The ladder is 2.5 days, 5 days, 10 days — each one double the last, so it
 * reads as a deliberate progression rather than three arbitrary numbers, and
 * so the last one is a goal somebody keeps playing towards rather than a
 * thing they buy on the second evening and then have nothing left to want.
 *
 * These went up from 500/750/1200, which was one day, one and a half, and two
 * and a half: the whole catalogue was owned in under a week and the arcade
 * lost its reason to exist. The characters are the only coin sink in the
 * game, so their prices are what the economy is FOR.
 *
 * ── The ceiling, which is a test and not a preference ────────────────────
 *
 * `coins.test.ts` asserts every price sits strictly between `MAX_PER_COURSE`
 * (300, one course at Author) and `MAX_PER_COURSE * 20` (6000, the whole
 * shipped ladder at its top tier). Below the floor a single course buys a
 * character; at or above the ceiling parkour cannot buy it at all, however
 * well it is played, and the shop becomes a locked door with a number on it.
 * 6000 was tried here and is exactly the ceiling, so it failed — 5000 leaves
 * the top character at 83% of the ladder, expensive but genuinely reachable,
 * with the arcade shortening it rather than being the only way through.
 *
 * Raising them is safe in a way that lowering them is not: coins are earned
 * and never sold, so a price is a length of play, never a cost. If it ever
 * becomes a cost, this comment stops being true and the numbers want a much
 * harder look — SPEC.md §1 is explicit about wait-or-pay.
 */
export const CHARACTERS: Character[] = [
  {
    id: "courier",
    name: "Courier",
    blurb: "The one you already are. Lit visor, no download.",
    price: 0,
    url: null,
    scale: 1,
    accent: DESIGNS.courier.glow,
  },
  {
    id: "emberforged",
    name: "Emberforged",
    blurb: "Horned, heavy and dark. Built to take a bad landing.",
    price: 1250,
    url: null,
    scale: 1,
    accent: DESIGNS.emberforged.glow,
  },
  {
    id: "voidtouched",
    name: "Voidtouched",
    blurb: "A hat with opinions, and something purple under it.",
    price: 2500,
    url: null,
    scale: 1,
    accent: DESIGNS.voidtouched.glow,
  },
  {
    id: "frostbound",
    name: "Frostbound",
    blurb: "Cold enough to be quiet about it. Rattles on landing.",
    price: 5000,
    url: null,
    scale: 1,
    accent: DESIGNS.frostbound.glow,
  },
];

/**
 * ── Why every `url` is null ──────────────────────────────────────────────
 *
 * The roster used to be one procedural courier and three downloaded GLBs. The
 * GLBs had no licence anybody could produce, which is a launch blocker rather
 * than a to-do, and they were a different art direction from the game they
 * were in. Both problems have the same answer: author the roster here, in
 * code, where it is owned outright and costs no download.
 *
 * `url` and `scale` are kept on the interface rather than deleted. The GLB
 * path (`CharacterRig`, `chars:optimize`, the rig FK test) all still work, so
 * a properly licensed model can be added as one row without reviving a code
 * path — and the `scaled` constant above is what it would use.
 *
 * See `lib/character-design.ts` for the designs themselves, and LICENSING.md
 * for the decision.
 */

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
