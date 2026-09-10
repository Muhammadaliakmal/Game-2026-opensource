/**
 * Every number Snakes & Ladders has an opinion about, and one argument.
 *
 * ── The argument: this game has no decisions, so it was given some ───────
 *
 * Snakes & Ladders as printed is not a game in the sense the rest of the
 * arcade uses the word. There is no move to choose — you roll, you count, the
 * board decides — so two players and a die produce a result nobody influenced.
 * That is fine as a thing to play with a six-year-old and useless as a
 * cabinet, because a run in which the player made no decision is a run they
 * cannot get better at.
 *
 * The cards are the fix, and they are deliberately the *whole* of it: the
 * board, the dice and the snakes are untouched and still the game everybody
 * knows. What changed is that some turns now ask a question — spend this, or
 * keep it — and the answer needs the player to look at where the snakes are.
 * A player with an empty hand plays the original game, and the machine's
 * single-legal-move autoplay quietly plays it for them.
 */

export type CardKind = "boost" | "anchor" | "reverse" | "swap";

export interface CardSpec {
  readonly kind: CardKind;
  /** Two or three characters, drawn large on the card face. */
  readonly glyph: string;
  /** The word under it. Short enough to read at cell size on a phone. */
  readonly name: string;
  /** One line, for the lobby and for anywhere that has room to explain. */
  readonly blurb: string;
  /** How many are in the deck. */
  readonly weight: number;
}

/**
 * Four cards, each on a different axis, and that is the reason there are four.
 *
 * Boost changes how far you go, Reverse changes which way, Anchor changes what
 * the square does to you, and Swap changes who you are racing. A fifth card
 * that was "boost but three" would be a fifth thing to read on the tray and no
 * new decision at all.
 *
 * All four are spent *after* the dice have landed, which is the point. A card
 * chosen before the roll is a bet; a card chosen after it is a decision, and
 * the difference is the whole reason this layer exists.
 */
export const CARDS: Record<CardKind, CardSpec> = {
  boost: {
    kind: "boost",
    glyph: "x2",
    name: "BOOST",
    blurb: "Count the roll twice.",
    weight: 8,
  },
  anchor: {
    kind: "anchor",
    glyph: "⚓",
    name: "ANCHOR",
    blurb: "The snake you land on lets you go.",
    weight: 6,
  },
  reverse: {
    kind: "reverse",
    glyph: "↶",
    name: "REVERSE",
    blurb: "Count the roll backwards.",
    weight: 6,
  },
  swap: {
    kind: "swap",
    glyph: "⇄",
    name: "SWAP",
    blurb: "Trade squares with the leader.",
    weight: 4,
  },
};

export const CARD_KINDS: readonly CardKind[] = ["boost", "anchor", "reverse", "swap"];

/** Cards dealt to each seat before the first roll, so turn one has a question. */
export const OPENING_HAND = 1;

/**
 * Consecutive sixes before the extra rolls stop.
 *
 * A six rolls again, which is the rule everybody plays. Uncapped it is also
 * the one way a turn can run for a minute — and unlike Ludo, where a sixes
 * streak at least risks the three-six forfeit, here it is pure gain. The third
 * six moves you and ends your turn. Nothing is taken away; the tap just stops.
 */
export const SIXES_CAP = 3;

export interface SnakesSettings {
  /** The match stops at the first seat home. See `plan-phase8.md` §2D. */
  endOnFirstWin: boolean;
  /** Cards on. Off is the printed game, and is a supported way to play it. */
  cards: boolean;
}

export const DEFAULT_SETTINGS: SnakesSettings = {
  endOnFirstWin: true,
  cards: true,
};

/**
 * What a bot wants.
 *
 * Ordinal before cardinal, as in Ludo's table: what matters is that winning
 * beats a card square, and a card square beats a couple of squares of walking.
 *
 * ── `cardCost` is the whole of the bot's judgement ───────────────────────
 *
 * Every card is evaluated the same way — what square do I end on, and what is
 * that square worth — minus a flat charge for having spent the card. Set to
 * zero, a bot dumps its hand on the first turn a card gains it a single
 * square. Set too high it dies holding three cards, which is the more
 * embarrassing failure to watch. Fifteen is about three squares of walking,
 * so a card is spent for a ladder, for a snake dodged, or for the win, and not
 * for a nudge.
 */
export const BOT_WEIGHTS = {
  /** Landing on 100. Dominates everything, because it ends the match. */
  win: 1000,
  /** Per square of net progress. The tie-breaker, deliberately small. */
  advance: 1,
  /** Picking up a card, when there is room in the hand for it. */
  cardSquare: 12,
  /** Charged once for playing any card at all. */
  cardCost: 15,
  /** Per square the leader loses, on top of what the swapper gains. */
  denyLeader: 0.4,
} as const;
