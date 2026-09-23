/**
 * What each arcade cabinet is, how it scores, and how to play it well.
 *
 * ── Why this is not in `arcade/registry.ts` ──────────────────────────────
 *
 * That file holds a dynamic `import()` per cabinet and is careful about it:
 * `matter-js` alone is ~80 kB gzipped and a player who never walks up to a
 * cabinet should not download it. This file imports nothing at all, so a
 * guide page can render every word about every cabinet without the bundler
 * having to reason about whether a game module came with it.
 *
 * The overlap is deliberate and one-directional: the registry owns the title,
 * the tagline and the control hints, and the guide page reads them from there.
 * Nothing in this file repeats them.
 *
 * ── What `scoring` has to be ─────────────────────────────────────────────
 *
 * The actual rule, in numbers, matching the game. A player who reads it
 * should be able to predict their score before the run ends. "Score points by
 * playing well" is the sentence this field exists to prevent.
 */

export interface CabinetNotes {
  /** What the cabinet is and what a run of it looks like. */
  readonly what: string;
  /** How points are awarded, in the game's own numbers. */
  readonly scoring: string;
  /** One concrete thing to do differently. */
  readonly approach: string;
}

export const CABINET_NOTES: Record<string, CabinetNotes> = {
  "chunk-runner": {
    what:
      "An endless runner across broken ground. You never stop moving " +
      "forward; the only input is a jump you can hold to glide, and the " +
      "ground stops being reliable almost immediately. A run lasts as long as " +
      "you keep landing on something.",
    scoring:
      "Distance is the score, and it pays half a coin a point — the middle " +
      "rate in the arcade. Because there is no top to an endless runner, a " +
      "long run is worth more than a clever one, which is why the rate is " +
      "lower than Tower Stack's.",
    approach:
      "The glide is not an extra jump, it is a longer one. Holding it from " +
      "the apex covers gaps that a tapped jump cannot, and letting go early " +
      "is the mistake that ends most runs.",
  },
  "tower-stack": {
    what:
      "Blocks swing past and you drop them on the stack below. Anything " +
      "hanging over the edge is sheared off, so the tower narrows every time " +
      "you are late. A run ends when the tower is too thin to land on.",
    scoring:
      "Two coins a point, the highest rate in the arcade, because the game " +
      "has a natural ceiling: a perfect stack narrows to nothing eventually " +
      "regardless of skill, so there is no way to farm it by playing longer.",
    approach:
      "Aim for the trailing edge rather than the centre. A block dropped " +
      "slightly late shears off the side you can afford to lose; one dropped " +
      "early shears off the side you are about to need.",
  },
  ludo: {
    what:
      "The four-seat board game, with three bots in the other seats. You roll, " +
      "you choose which of your pieces to move, and getting home first is the " +
      "whole of it. A match runs a few minutes.",
    scoring:
      "A placement, not a score — this is one of two cabinets that report " +
      "where you finished rather than a running total, which is why the " +
      "overlay shows no number in the corner while you play.",
    approach:
      "The choice of which piece to move is the only real decision in the " +
      "game, and the safe one is usually the piece furthest from home rather " +
      "than the one closest to it.",
  },
  snakes: {
    what:
      "Snakes and Ladders with a hand of cards on top of it. The board still " +
      "decides where you land; the cards are the part you control, and " +
      "spending one at the right moment is the difference between this and " +
      "the version you played as a child.",
    scoring:
      "A placement, like Ludo. There is no running score to watch, and the " +
      "cabinet's music is slower than the runners' for the same reason — it " +
      "is a game of deliberating rather than reacting.",
    approach:
      "Hold a card until you can see the snake it saves you from. Spending " +
      "one to gain three squares is how a hand is wasted.",
  },
  echo: {
    what:
      "A room, run against a clock, and then run again beside a replay of the " +
      "run you just did. Every attempt adds another copy of you to the room, " +
      "and solving it means using your own past selves as part of the " +
      "solution.",
    scoring:
      "A fifth of a coin a point. Each room pays around 100 points plus " +
      "bonuses, so a clean ladder is roughly 1,000 points and about 200 " +
      "coins. Like the other two puzzle cabinets it has a top — a perfect run " +
      "of every room — so it cannot be farmed by playing longer, only better.",
    approach:
      "Plan the run you are about to record, not the one you are in. The " +
      "copy you leave behind is a tool for the next attempt, and a sloppy " +
      "first run is a sloppy tool forever.",
  },
  gravity: {
    what:
      "A ball and four walls, where down is whichever direction you choose. " +
      "Every flip commits you to a fall, and the fall is watched rather than " +
      "steered — the decision is made before it starts.",
    scoring:
      "A fifth of a coin a point, on the same scale as ECHO and One Bullet: " +
      "around 100 a room, with a perfect ladder near 1,000 points and 200 " +
      "coins.",
    approach:
      "Flip late rather than early. The ball keeps its momentum through a " +
      "change of gravity, so a flip made at the last moment travels further " +
      "than one made at the start of the same fall.",
  },
  bullet: {
    what:
      "One shot per room, aimed and released, and it has to do everything the " +
      "room needs. It has the slowest music in the arcade because aiming is a " +
      "held breath and a track that hurries the shot costs you the room.",
    scoring:
      "A fifth of a coin a point, the puzzle rate. The same roughly 1,000 " +
      "points for a clean ladder, and the same absence of any way to grind it.",
    approach:
      "Use fine aim. On a keyboard that is Shift, and the difference between " +
      "a coarse and a fine adjustment is most of the rooms in the back half " +
      "of the game.",
  },
  swarm: {
    what:
      "You are one of a crowd, eating what is smaller than you and avoiding " +
      "what is not. Dashing and splitting are both available and both " +
      "dangerous. It has the fastest music in the arcade because something " +
      "happens every second or two.",
    scoring:
      "Mass eaten plus kills plus a placement bonus, at a twentieth of a coin " +
      "a point — the lowest rate in the arcade, because a run scores in the " +
      "hundreds to thousands. A strong run lands around a hundred coins.",
    approach:
      "Splitting doubles your reach and halves your safety, so do it to " +
      "finish something rather than to chase it. A split that misses leaves " +
      "two of you small in a crowd that is not.",
  },
  reflex: {
    what:
      "A target appears, a ring closes on it, and you hit it before the ring " +
      "does. That is the entire game. It has no top and no length limit — a " +
      "perfect player runs until they decide to stop.",
    scoring:
      "Ten points a hit plus up to 30 of streak bonus, at a twentieth of a " +
      "coin a point. A good two-minute run is a few thousand points, or " +
      "around a hundred coins. It is priced as a runner rather than a puzzle " +
      "precisely because it has no ceiling.",
    approach:
      "Protect the streak over the individual hit. The bonus is worth three " +
      "times the hit itself at full stretch, so a target you are not sure of " +
      "is worth taking slowly rather than missing fast.",
  },
  duel: {
    what:
      "A best-of-three duel between two robots on the Magma Gauntlet: two " +
      "stone banks, a bridge between them that rides up and down, a high " +
      "bridge over it, and lava under everything. The robots are ragdolls " +
      "driven by muscles, so nothing is an animation — the stick names a " +
      "direction and the weapon arm reaches for it. Every twelve seconds the " +
      "lava shows a tell and two seconds later rises far enough to swallow " +
      "the low bridge. Play it against the CPU on three levels, or with a " +
      "second person on the same screen or keyboard.",
    scoring:
      "Damage is the speed of the weapon at the point of contact, relative " +
      "to the part it touched, above a graze threshold — a head takes one " +
      "and a half times a chest, a limb about half. A round is won by " +
      "knockout, by the lava, or on health when the sixty-second clock runs " +
      "out. Against the CPU the score is 100 a round won, the damage you " +
      "dealt and 300 for the match, times one, two or three for Easy, Medium " +
      "or Hard, at a twentieth of a coin a point. Two players on one screen " +
      "pays nothing.",
    approach:
      "Push the stick part of the way. Past a third of its travel sideways " +
      "it walks you; under that it only aims, so you can swing through " +
      "somebody without stepping into their reach. The heavy swing is the " +
      "biggest hit in the game and the easiest to read: the weapon glows " +
      "while it charges, and Hard backs off from it — spend it on an " +
      "opponent who is stunned, or standing on the low bridge as the lava " +
      "comes up.",
  },
};

/** Notes for a cabinet id, or undefined for one nobody has written about. */
export const cabinetNotesFor = (id: string): CabinetNotes | undefined =>
  CABINET_NOTES[id];
