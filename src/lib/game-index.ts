import { CABINETS } from "@/arcade/registry";
import { BUILT_IN_WORLDS } from "./built-in-worlds";

/**
 * Everything on the site a search can open, as one flat list.
 *
 * Built from the same registries the games hub renders from — the arcade's
 * cabinets, the built-in worlds, the three modes — so a search cannot know
 * about a game the hub does not, or miss one it has. Imports nothing from
 * three.js: the search box is on the front page, which must not pay for the
 * renderer to render a text field.
 *
 * `terms` are the words somebody might type that are not in the name: a
 * player looking for "bikes" wants the race, and one typing "ludo" gets the
 * cabinet whether or not they know it is in the arcade.
 */
export interface GameEntry {
  href: string;
  title: string;
  /** The line under the name in a result. */
  blurb: string;
  kind: "mode" | "arcade" | "world" | "course";
  /** Extra words that match, lowercased. */
  terms: string[];
}

const MODES: GameEntry[] = [
  {
    href: "/parkour",
    title: "Parkour",
    blurb: "Courses, medals, and the ghost of your best run.",
    kind: "mode",
    terms: ["jump", "run", "course", "platformer", "medal", "ghost", "time trial"],
  },
  {
    href: "/race",
    title: "Race",
    blurb: "Bikes on a neon loop. Multiplayer.",
    kind: "mode",
    terms: ["bike", "bikes", "racing", "drift", "boost", "multiplayer", "grid"],
  },
  {
    href: "/arena",
    title: "Arena",
    blurb: "One opponent, first to five knockdowns.",
    kind: "mode",
    terms: ["fight", "duel", "match", "versus", "pvp", "multiplayer", "knockdown"],
  },
  {
    href: "/arcade",
    title: "Arcade",
    blurb: "Four cabinets, ninety seconds a go.",
    kind: "mode",
    terms: ["cabinet", "minigame", "coins", "quick"],
  },
];

export const GAME_INDEX: GameEntry[] = [
  ...MODES,
  ...CABINETS.map<GameEntry>((c) => ({
    href: `/arcade?play=${c.id}`,
    title: c.title,
    blurb: c.tagline,
    kind: "arcade",
    terms: ["arcade", "cabinet", c.id.replace(/-/g, " "), ...(c.board ? ["board", "dice"] : [])],
  })),
  ...BUILT_IN_WORLDS.map<GameEntry>((w) => ({
    href: `/play/${w.slug}`,
    title: w.name,
    blurb: w.tier ? `${w.tier} course` : w.blurb,
    kind: w.tier ? "course" : "world",
    terms: [w.slug, ...(w.tier ? ["parkour", "course", w.tier.toLowerCase()] : ["world", "sandbox", "explore"])],
  })),
];

/**
 * Rank the index against a query. Name prefix beats name substring beats a
 * term match, and a tie keeps index order, which is the hub's order.
 */
export function searchIndex(query: string, index: GameEntry[] = GAME_INDEX): GameEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[number, GameEntry]> = [];
  for (const e of index) {
    const name = e.title.toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    else if (e.terms.some((t) => t.startsWith(q) || t.includes(q))) score = 1;
    else if (e.blurb.toLowerCase().includes(q)) score = 0.5;
    if (score > 0) scored.push([score, e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, e]) => e);
}
