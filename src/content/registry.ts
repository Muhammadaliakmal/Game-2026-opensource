/**
 * Every playable thing on the site, as one flat list.
 *
 * ── Why this file has no imports ─────────────────────────────────────────
 *
 * It is read by three kinds of caller with three incompatible appetites:
 *
 *  - the stats API routes, which need only to answer "is this a real slug?"
 *    and must not drag twenty-one course geometry builders into a function
 *    whose whole job is to increment an integer;
 *  - card components on the home page, the arcade and the parkour ladder;
 *  - `lib/game-index.ts`, the search index, which already promises to import
 *    nothing from three.js.
 *
 * So the rows are written out rather than derived. That is a second list, and
 * a second list is exactly what this codebase spends its comments warning
 * against — which is why `registry.test.ts` asserts that it holds precisely
 * the slugs `CABINETS`, `PARKOUR_COURSES` and `SANDBOX_WORLDS` hold, with the
 * same titles. Adding a cabinet and forgetting this file fails the suite with
 * the missing slug named. The list cannot drift; it can only fail to build.
 *
 * ── The slug is a database key ───────────────────────────────────────────
 *
 * `slug` is the primary key of `game_stats`, `game_likes` and
 * `game_plays_daily`, and it is therefore permanent: renaming one abandons
 * that row's plays and likes with no way to find them again. It is also
 * globally unique across kinds, which the test pins — a flat `bySlug` map is
 * the only thing standing between a new race track called `spiral` and the
 * Easy course that has been called `spiral` since 7 September.
 */

/** What sort of thing an entry is. `track` is reserved for Phase 3.2. */
export type GameKind = "mode" | "arcade" | "world" | "course" | "track";

/**
 * The closed tag vocabulary.
 *
 * Closed, and short, because these are filter chips: a tag that appears on one
 * entry is a chip that filters thirty-four things away, and a player who
 * presses it learns nothing.
 */
export type GameTag =
  | "Solo"
  | "Multiplayer"
  | "Bots"
  | "Timed"
  | "Ghosts"
  | "Medals"
  | "Puzzle"
  | "Reflex"
  | "Turn-based"
  | "Sandbox"
  | "Casual"
  | "Hard";

export interface GameEntry {
  /** Stable forever — it is the stats key. See the note above. */
  slug: string;
  kind: GameKind;
  title: string;
  tagline: string;
  href: string;
  /**
   * Cover art, or undefined for a cabinet.
   *
   * The spec has this required. The eight cabinets have no image file: their
   * shelf art is `<CabinetPreview>`, a canvas drawn from the same tuning
   * numbers the game runs on, so a cabinet cannot ship a screenshot of a
   * version of itself that no longer exists. A field that would have to hold a
   * placeholder path on eight of thirty-five rows is better absent.
   */
  thumb?: string;
  tags: readonly GameTag[];
  /**
   * When this shipped, as an ISO date. Powers the "New" pill and the Newest
   * sort.
   *
   * Every one of these is the commit date the content actually landed on,
   * read out of git rather than invented — a "New" badge that is wrong is
   * worse than no badge, because it is the one part of a card a returning
   * player is scanning for.
   */
  addedAt: string;
  /** A course or track's parent mode, for grouping. */
  parent?: string;
}

/**
 * The two modes with a room or a ladder behind them.
 *
 * The arcade is deliberately not here. It is a page of eight cabinets rather
 * than a game, so a `plays` counter on it would count door-openings, and the
 * eight things behind the door already count themselves. `lib/game-index.ts`
 * adds it for search, where "arcade" is a word somebody types.
 *
 * Note the slugs are `parkour-mode` and `race-mode`. `parkour` is already the
 * slug of Neon Run, the Tutorial course, and has been since the first commit —
 * it is in saved `runs` rows and in `/play/parkour` links people hold. The
 * mode takes the suffix because the course cannot give the name up.
 *
 * ── Neither mode card carries a stats badge, and only one is counted ─────
 *
 * A badge is there to help somebody choose between many similar things. There
 * are two modes, they are the largest thing on the page, and nobody is
 * comparing them by play count — so the badge goes on the thirty-three items
 * where the comparison means something and not on these.
 *
 * `race-mode` is still *counted*, because `/race/<code>` is a real session and
 * "Popular this week" should be able to say so. `parkour-mode` is not: it is a
 * course picker, and every course behind it counts itself. Its row exists for
 * search, the sitemap and the sorting, and will sit at zero forever — which is
 * the right answer for a page rather than a game.
 */
const MODES: readonly GameEntry[] = [
  {
    slug: "parkour-mode",
    kind: "mode",
    title: "Parkour",
    tagline: "Jump it, time it, take the medal.",
    href: "/parkour",
    thumb: "/covers/parkour.png",
    tags: ["Solo", "Timed", "Ghosts", "Medals"],
    addedAt: "2026-09-01",
  },
  {
    slug: "race-mode",
    kind: "mode",
    title: "Race",
    tagline: "Bikes on a neon loop. Drift to fill the boost.",
    href: "/race",
    thumb: "/covers/circuit.png",
    tags: ["Multiplayer", "Timed"],
    addedAt: "2026-09-02",
  },
];

const ARCADE: readonly GameEntry[] = [
  {
    slug: "chunk-runner",
    kind: "arcade",
    title: "Chunk Runner",
    tagline: "Don't stop. Don't blink.",
    href: "/arcade?play=chunk-runner",
    tags: ["Solo", "Reflex", "Casual"],
    addedAt: "2026-09-08",
  },
  {
    slug: "tower-stack",
    kind: "arcade",
    title: "Tower Stack",
    tagline: "Perfect or nothing.",
    href: "/arcade?play=tower-stack",
    tags: ["Solo", "Reflex", "Casual"],
    addedAt: "2026-09-08",
  },
  {
    slug: "ludo",
    kind: "arcade",
    title: "Ludo",
    tagline: "Four seats. One of them is yours.",
    href: "/arcade?play=ludo",
    tags: ["Turn-based", "Bots", "Casual"],
    addedAt: "2026-09-09",
  },
  {
    slug: "snakes",
    kind: "arcade",
    title: "Snakes & Ladders",
    tagline: "The board decides. The cards are yours.",
    href: "/arcade?play=snakes",
    tags: ["Turn-based", "Bots", "Casual"],
    addedAt: "2026-09-10",
  },
  {
    slug: "echo",
    kind: "arcade",
    title: "ECHO",
    tagline: "Your last run is still in the room.",
    href: "/arcade?play=echo",
    tags: ["Solo", "Puzzle"],
    addedAt: "2026-09-16",
  },
  {
    slug: "gravity",
    kind: "arcade",
    title: "Gravity Shift",
    tagline: "Down is whichever way you say.",
    href: "/arcade?play=gravity",
    tags: ["Solo", "Puzzle"],
    addedAt: "2026-09-16",
  },
  {
    slug: "bullet",
    kind: "arcade",
    title: "One Bullet",
    tagline: "One shot. Make it do everything.",
    href: "/arcade?play=bullet",
    tags: ["Solo", "Puzzle", "Hard"],
    addedAt: "2026-09-16",
  },
  {
    slug: "swarm",
    kind: "arcade",
    title: "SwarmRush",
    tagline: "Eat. Grow. Don't get eaten.",
    href: "/arcade?play=swarm",
    tags: ["Solo", "Bots", "Reflex"],
    addedAt: "2026-09-17",
  },
];

/** Every course carries these; the hard end of the ladder adds "Hard". */
const RUN: readonly GameTag[] = ["Solo", "Timed", "Medals", "Ghosts"];
const RUN_HARD: readonly GameTag[] = [...RUN, "Hard"];

/**
 * The ladder, in ladder order. Tier is not stored here — `PARKOUR_COURSES` is
 * the authority on difficulty and the parkour page reads it from there. This
 * file holds only what a card outside that page needs.
 */
const COURSES: readonly GameEntry[] = (
  [
    { slug: "parkour", title: "Neon Run", tagline: "A forgiving obstacle course. Stones, a walkway, floating islands.", tags: RUN, addedAt: "2026-09-01" },
    { slug: "steps", title: "Harbour Steps", tagline: "A causeway out, a climb, and a long shelf home. Nothing to fall off.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "lanterns", title: "Lantern Row", tagline: "A lit street with one turn in it. The route is visible from the start.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "meadow", title: "Meadow Rise", tagline: "A long climb to a summit, with two staircases to rest on.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "climb", title: "Beacon Climb", tagline: "Four switchback flights to a lit tower. One jump, learned properly.", tags: RUN, addedAt: "2026-09-04" },
    { slug: "spiral", title: "Spiral Yard", tagline: "Two laps of a square helix. A quarter of the jumps are corners.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "bridges", title: "Copper Bridges", tagline: "Long spans between landings, and two descents that open up to three.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "orchard", title: "Sky Orchard", tagline: "A weave with no straight section in it, through unreachable trees.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "gap", title: "Cinder Gap", tagline: "A broken causeway, an S-bend, and a descent that opens up.", tags: RUN, addedAt: "2026-09-04" },
    { slug: "ratchet", title: "Ratchet", tagline: "A climb that changes axis on every hop. No straight line until the top.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "switchyard", title: "Switchback Yard", tagline: "Beacon Climb's tower, with the turn taken on the pad and no deck to walk.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "turnpike", title: "The Turnpike", tagline: "One hard corner, and a plunge on the far side you arrive at already turned.", tags: RUN, addedAt: "2026-09-07" },
    { slug: "narrows", title: "The Narrows", tagline: "Ordinary jumps onto beams one cell wide. Precision, with no clock on it.", tags: RUN, addedAt: "2026-09-18" },
    { slug: "vault", title: "Vault of Wires", tagline: "One-cell walkways and a zigzag that turns on every pad.", tags: RUN_HARD, addedAt: "2026-09-04" },
    { slug: "zipline", title: "Zip Line", tagline: "Vault's zigzag as the whole course. Sixteen turns, not one cell of slack.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "gauntlet", title: "The Gauntlet", tagline: "A plunge of six 2x2 pads, banked by one checkpoint at the top of it.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "needle", title: "Needlepoint", tagline: "Every other landing is a 2x1 pad seen end-on. Straight, and unforgiving.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "spindle", title: "Spindle", tagline: "A tower climbed on a widening spiral, with nothing to bank on the way up.", tags: RUN_HARD, addedAt: "2026-09-18" },
    { slug: "overclock", title: "Overclock", tagline: "Single-block landings, the whole way. One jump sits on the limit.", tags: RUN_HARD, addedAt: "2026-09-04" },
    { slug: "filament", title: "Filament", tagline: "Flat single-cell landings, turning the whole time. One long jump up.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "arclight", title: "Arc Light", tagline: "A single-cell spiral almost straight up, then the whole way back down.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "lattice", title: "Lattice", tagline: "Ninety degrees into a one-cell target every hop, with two plunges to rest.", tags: RUN_HARD, addedAt: "2026-09-07" },
    { slug: "magma", title: "Magma Gauntlet", tagline: "Seven stages over a lava sea. Touch the glow and you are back at the checkpoint.", tags: RUN_HARD, addedAt: "2026-09-15" },
  ] as const
).map((c) => ({
  ...c,
  kind: "course" as const,
  href: `/play/${c.slug}`,
  thumb: `/covers/${c.slug}.png`,
  parent: "parkour-mode",
}));

const WORLD_TAGS: readonly GameTag[] = ["Sandbox", "Solo", "Casual"];

const WORLDS: readonly GameEntry[] = (
  [
    { slug: "island", title: "Sky Yard", tagline: "An island in the void. Trees, an arch, a lantern path. No goal.", addedAt: "2026-09-02" },
    { slug: "cottage", title: "The Cottage", tagline: "A house you can walk into — and the clearest thing here to remix.", addedAt: "2026-09-02" },
    { slug: "circuit", title: "Neon Circuit", tagline: "A railed loop with nothing to fall off. Hold sprint and go.", addedAt: "2026-09-02" },
    { slug: "ridge", title: "Vapor Ridge", tagline: "The circuit's shape, up on stilts, with a crest that throws you off the end of it.", addedAt: "2026-09-07" },
  ] as const
).map((w) => ({
  ...w,
  kind: "world" as const,
  href: `/play/${w.slug}`,
  thumb: `/covers/${w.slug}.png`,
  tags: WORLD_TAGS,
}));

/** Phase 3.2. Empty rather than absent, so the kind is already wired. */
const TRACKS: readonly GameEntry[] = [];

export const REGISTRY: readonly GameEntry[] = [
  ...MODES,
  ...ARCADE,
  ...COURSES,
  ...WORLDS,
  ...TRACKS,
];

export const bySlug: ReadonlyMap<string, GameEntry> = new Map(
  REGISTRY.map((e) => [e.slug, e])
);

export const byKind = (k: GameKind): GameEntry[] =>
  REGISTRY.filter((e) => e.kind === k);

/**
 * How much of each thing the game has, for the copy that says so.
 *
 * ── Why these are here and not typed into the sentences ─────────────────
 *
 * Because they went wrong. The About page said "there are five parkour
 * courses" while twenty-one shipped, the root layout's meta description and
 * the home page headline both said twenty, and `/parkour`'s own description
 * said twenty while the paragraph underneath it — which reads
 * `PARKOUR_COURSES.length` — said twenty-one on the same screen.
 *
 * None of that is careless writing. It is what a number in prose does: it is
 * correct on the day it is typed, and nothing about adding a course tells the
 * About page. A count that is four times wrong is on the page a visitor reads
 * to decide whether this site is maintained.
 *
 * Derived from the registry, which the drift test pins to the real content —
 * so these cannot be wrong without the suite going red, and the sentences are
 * now as maintainable as the list.
 */
export const COURSE_COUNT = REGISTRY.filter((e) => e.kind === "course").length;
export const CABINET_COUNT = REGISTRY.filter((e) => e.kind === "arcade").length;
export const WORLD_COUNT = REGISTRY.filter((e) => e.kind === "world").length;

/**
 * The guard every stats route runs before touching the database.
 *
 * It is the only thing preventing key-space pollution: without it a
 * hand-written POST could create a `game_stats` row for any string it liked,
 * and the table would fill with slugs no page will ever read back.
 */
export const isKnownSlug = (s: unknown): s is string =>
  typeof s === "string" && bySlug.has(s);

/** The vocabulary in reading order, for anything that lists tags. */
export const ALL_TAGS: readonly GameTag[] = [
  "Solo",
  "Multiplayer",
  "Bots",
  "Timed",
  "Ghosts",
  "Medals",
  "Puzzle",
  "Reflex",
  "Turn-based",
  "Sandbox",
  "Casual",
  "Hard",
];

/** Every tag on at least one row. What a tag is allowed to be. */
export const TAGS_IN_USE: readonly GameTag[] = ALL_TAGS.filter((t) =>
  REGISTRY.some((e) => e.tags.includes(t))
);

/**
 * The chips to offer above a given set of cards.
 *
 * Computed per list rather than globally, and only for tags on two or more of
 * the rows in front of the player. A chip that leaves one card is a chip
 * nobody presses twice, and "Multiplayer" is exactly that on the full
 * registry: the race is the only thing wearing it since the arena was cut in
 * September. It stays in the vocabulary because it is still worth *reading*
 * on the race card — showing a tag and filtering by it are different jobs,
 * and conflating them is what put a dead chip on the page.
 */
export function filterTagsFor(entries: readonly GameEntry[]): GameTag[] {
  return ALL_TAGS.filter(
    (t) => entries.filter((e) => e.tags.includes(t)).length >= 2
  );
}

/**
 * How long an entry wears the "New" pill.
 *
 * Fourteen days, from the spec. Compared against a time the caller passes in
 * rather than against `Date.now()` read in here, because these cards render on
 * the server on pages that may be cached — `DailyChallenge` has the same
 * problem and solves it the same way.
 */
export const NEW_FOR_DAYS = 14;

/**
 * How many distinct ship-dates count as "the latest content".
 *
 * ── Why a date window alone is not enough ────────────────────────────────
 *
 * The spec's rule is fourteen days, which is right for a catalogue that grew
 * over a year. This one was built in eighteen days, so on the day the pill
 * shipped it appeared on eighteen of twenty-three cards — every course except
 * the four written in the first week.
 *
 * That is technically correct and completely useless. A badge on eighty per
 * cent of a list is not a badge, it is a background colour, and the one thing
 * a returning player is scanning for is the thing it stops being able to
 * point at.
 *
 * So "New" is two conditions, not one: recent on the clock *and* recent
 * relative to everything else that ships. The second half is this — the two
 * most recent distinct dates in the registry, which is three entries today and
 * would be three or four after any normal batch. On a mature catalogue the
 * date window is the binding constraint and this changes nothing; on a young
 * one it is what keeps the pill meaning something.
 */
const NEWEST_COHORTS = 2;

/**
 * The ship-dates that count as the latest, newest first.
 *
 * Pure and clock-free, which is what lets a server component ask the question
 * — the other half of the test needs `Date.now()` and lives in `<NewPill>`.
 */
export const NEWEST_DATES: readonly string[] = [
  ...new Set(REGISTRY.map((e) => e.addedAt)),
]
  .sort((a, b) => b.localeCompare(a))
  .slice(0, NEWEST_COHORTS);

/** Whether this entry is part of the most recent batch of content. */
export const inNewestCohort = (entry: GameEntry): boolean =>
  NEWEST_DATES.includes(entry.addedAt);

/**
 * Both halves of "New": in the latest batch, and still inside the window.
 *
 * `now` is passed in rather than read here, because these cards render on the
 * server on pages that may be cached — `DailyChallenge` has the same problem
 * and solves it the same way.
 */
export function isNew(entry: GameEntry, now: number): boolean {
  if (!inNewestCohort(entry)) return false;
  const added = Date.parse(entry.addedAt);
  if (Number.isNaN(added)) return false;
  return now - added < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}
