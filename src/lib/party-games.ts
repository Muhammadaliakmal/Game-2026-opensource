/**
 * Which games a party can play together, and how.
 *
 * Pure and import-free, so the party's rules (`lib/party.ts`) can refuse a
 * pick they do not know without importing `arcade/registry.ts` and every
 * cabinet's dynamic import with it. `party-games.test.ts` holds this list to
 * the registry, so a renamed cabinet fails the suite rather than a party.
 *
 * `kind` is how the game is shared:
 * - `score` — everyone plays the same seed on their own screen, and the
 *   numbers are compared. Works for any cabinet whose run is a function of
 *   its seed, which is every runner here.
 * - `seats` — one table, remote humans in the seats bots would take (11C).
 * - `duel` — one fight, two players (11D).
 *
 * `ready` is whether the mode is built. A listed game that is not ready is
 * shown in the lobby as "soon" and cannot be picked.
 */

export type PartyKind = "score" | "seats" | "duel";

export interface PartyGame {
  id: string;
  kind: PartyKind;
  ready: boolean;
}

export const PARTY_GAMES: readonly PartyGame[] = [
  { id: "chunk-runner", kind: "score", ready: true },
  { id: "tower-stack", kind: "score", ready: true },
  { id: "gravity", kind: "score", ready: true },
  { id: "bullet", kind: "score", ready: true },
  { id: "swarm", kind: "score", ready: true },
  { id: "reflex", kind: "score", ready: true },
  { id: "untwine", kind: "score", ready: true },
  { id: "echo", kind: "score", ready: true },
  { id: "ludo", kind: "seats", ready: false },
  { id: "snakes", kind: "seats", ready: false },
  { id: "duel", kind: "duel", ready: false },
];

const BY_ID = new Map(PARTY_GAMES.map((g) => [g.id, g]));

export const partyGame = (id: unknown): PartyGame | undefined =>
  typeof id === "string" ? BY_ID.get(id) : undefined;

/** A game a party may start right now. */
export const isPlayablePartyGame = (id: unknown): id is string =>
  partyGame(id)?.ready === true;

/** Most people a party holds. A living room, not a stadium. */
export const PARTY_MAX = 8;

/**
 * A guest's name in a party, picked from fixed words rather than typed.
 *
 * Names other people read are never user-typed free text in this app (see
 * `server/src/state.ts`, and SPEC §10 on why there is no chat). A party is
 * found by network, and on a carrier's shared address "nearby" can include
 * strangers, so the rule holds here too. A signed-in player shows their
 * account name; a guest is a colour and an animal.
 */
const COLOURS = ["Teal", "Amber", "Coral", "Violet", "Lime", "Rose", "Sky", "Gold", "Mint", "Ruby"];
const ANIMALS = ["Otter", "Fox", "Panda", "Lynx", "Koala", "Heron", "Gecko", "Moose", "Robin", "Yak"];

export function guestName(n: number): string {
  const i = Math.abs(Math.floor(n));
  return `${COLOURS[i % COLOURS.length]} ${ANIMALS[Math.floor(i / COLOURS.length) % ANIMALS.length]}`;
}

export interface Ranked<T> {
  row: T;
  place: number;
}

/**
 * Best score first, ties sharing a place: two people who scored the same did
 * the same, and "2nd" for one of them would be the join order speaking. The
 * room and the results screen both rank through this, so they cannot disagree.
 */
export function rankScores<T extends { score: number; order: number }>(rows: readonly T[]): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.order - b.order);
  const out: Ranked<T>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = out[i - 1];
    const place = prev && prev.row.score === sorted[i].score ? prev.place : i + 1;
    out.push({ row: sorted[i], place });
  }
  return out;
}
