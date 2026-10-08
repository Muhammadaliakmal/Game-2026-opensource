import { createAnimator } from "@/arcade/host/anim";
import { createPainter } from "@/arcade/host/board";
import { createBotDriver } from "@/arcade/host/bots";
import { createBoardLink, netMachineOptions, partySeats } from "@/arcade/host/board-net";
import { TURN_TIMER_STEPS, createTurnMachine } from "@/arcade/host/turn";
import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { reducedMotion } from "@/lib/motion";
import { HAND_LIMIT, SNAKES_GRAPH, START_SQUARE, handSlotOf } from "./board";
import { createRenderer } from "./render";
import {
  createSnakesRules,
  placings,
  tokenIdOf,
  type SnakesMove,
  type SnakesState,
} from "./rules";
import { DEFAULT_SETTINGS } from "./tuning";

/**
 * Snakes & Ladders — the machine, the animator, the bots and the tray, wired
 * to the host.
 *
 * Almost nothing of the game is in this file, which is the point of 8a–8b: the
 * phase machine, the hop queue, the seats and the board transform are all the
 * host's, and what is left here is the order they run in and the two things a
 * finger can mean.
 *
 * ── The two things a finger can mean ─────────────────────────────────────
 *
 * *Roll*, and *spend this card*. There is no "move that piece" — you have one
 * token and the dice have already decided where it goes — so a tap anywhere
 * that is not a card is the plain move. That asymmetry is the whole interface,
 * and it is the reason the cards live in a tray with cell ids of their own
 * rather than as a menu: the card is the only thing on the screen worth
 * hit-testing, so it is the only thing that gets a hit test.
 *
 * ── With an empty hand this game plays itself, and that is correct ───────
 *
 * The printed game has no decisions. When the hand offers nothing, the rules
 * return exactly one legal move and the machine's single-move autoplay takes
 * it after half a second — so a turn with no question in it costs the player a
 * tap on the dice and nothing else. The cards are the parts you actually play,
 * and they are also the only parts a player can be better than a bot at.
 */

const SEATS = 4;

/**
 * The seat the person holding the phone plays on a solo run. `fillSeats` puts
 * them first. A party match says which is theirs (`GameServices.net`).
 */
const SOLO_SEAT = 0;

/** A beat after the last hop lands, before the result screen. */
const END_FREEZE = 42;

/** How long the mark on a refused snake stays up. */
const HELD_STEPS = 40;

const ROLL_KEYS = ["Space", "Enter", "KeyW", "ArrowUp"] as const;

/**
 * One digit per card slot, sliced to the hand size rather than written out.
 *
 * A fourth card would otherwise be a card with no key, which is the sort of
 * omission that ships: the tray would draw it and the keyboard would not
 * reach it.
 */
const SLOT_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"].slice(0, HAND_LIMIT);

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const rules = createSnakesRules(DEFAULT_SETTINGS);

  // Everything random about a match comes off the host's seeded generator: the
  // same seed deals the same deck, seats the same bots and rolls the same dice.
  const seed = Math.floor(s.rng() * 0xffffffff) >>> 0;
  // A party match seats its players first and bots after; solo is you and
  // three bots. See `host/board-net.ts`.
  const seats = partySeats(s.net, SEATS, s.rng, "normal");
  const LOCAL = s.net ? s.net.seat : SOLO_SEAT;

  const machine = createTurnMachine<SnakesState, SnakesMove>({
    rules,
    seats,
    seed,
    rng: s.rng,
    // The host's table decides and says so; a guest's replays it.
    ...netMachineOptions(s.net),
  });
  const painter = createPainter(SNAKES_GRAPH);
  const animator = createAnimator({
    positionOf: (cell) => painter.at(cell),
    reduced: reducedMotion,
  });
  const bots = createBotDriver({ machine, rules, rng: s.rng });
  // A guest's taps become requests to the host; solo, they are plain calls.
  const link = createBoardLink({ net: s.net, machine, rules });
  /** Only the deciding table runs the bots. A puppet's bots would be a second opinion. */
  const runsBots = !s.net || s.net.isHost;
  const renderer = createRenderer(painter);

  for (let seat = 0; seat < seats.length; seat++) {
    animator.place(tokenIdOf(seat), START_SQUARE);
  }
  machine.start();

  let tick = 0;
  let lastRoll = 1;
  let wasDown = false;
  const keyWas: Record<string, boolean> = {};
  let endFreeze = 0;
  let ended = false;
  let held: { square: number; left: number } | null = null;

  /** A key going down this step, rather than being held. */
  const edge = (code: string) => {
    const now = s.input.keys[code] === true;
    const was = keyWas[code] === true;
    keyWas[code] = now;
    return now && !was;
  };

  const myTurn = () =>
    machine.phase === "awaitingMove" && machine.activeSeat.id === LOCAL;

  /** The local player's options, or nothing — a bot's hand is not shown. */
  const ownMoves = (): readonly SnakesMove[] => (myTurn() ? machine.moves : []);

  /**
   * The move each hand slot would play.
   *
   * Slot-shaped rather than move-shaped, because the tray draws three fixed
   * places and the rules return a list that has been filtered down to the
   * cards worth playing. Matching by kind rather than by index is what lets a
   * hand holding two Boosts light both slots: either one spends a Boost, and
   * being asked which of two identical cards to use is not a decision.
   */
  const slotMoves = (): Array<SnakesMove | null> => {
    const hand = machine.state.hands[LOCAL] ?? [];
    const moves = ownMoves();
    return Array.from(
      { length: HAND_LIMIT },
      (_, i) => moves.find((m) => m.card !== null && m.card === hand[i]) ?? null
    );
  };

  /** The plain move, which is what a tap on the board means. */
  const plainMove = () => ownMoves().find((m) => m.card === null) ?? null;

  const handleInput = () => {
    const down = s.input.pointer.down;
    const tapped = down && !wasDown;
    wasDown = down;

    // Every key edge is read every step whether or not it can be used, so a
    // key held through a phase change is not re-read as a fresh press on the
    // other side of it.
    let pressed = false;
    for (const code of ROLL_KEYS) if (edge(code)) pressed = true;
    const slotKeys = SLOT_KEYS.map((code) => edge(code));

    if (machine.activeSeat.id !== LOCAL) return;

    if (machine.phase === "awaitingRoll") {
      // A tap anywhere throws the dice. The die is a 60-pixel target in the
      // corner of a phone, and there is nothing else to press in this phase.
      if (tapped || pressed) link.roll();
      return;
    }

    if (machine.phase !== "awaitingMove") return;

    const slots = slotMoves();
    for (let i = 0; i < slotKeys.length; i++) {
      const move = slots[i];
      if (slotKeys[i] && move) {
        link.move(move);
        return;
      }
    }

    const plain = plainMove();
    if (pressed && plain) {
      link.move(plain);
      return;
    }

    if (!tapped) return;

    // A card if the finger landed on one, and the plain move otherwise —
    // including a tap on empty board, which is deliberately not ignored. The
    // alternative is a player tapping the square they can see they are going
    // to and nothing happening.
    const cell = painter.cellAt(s.input.pointer.x, s.input.pointer.y);
    const slot = cell === null ? -1 : handSlotOf(cell);
    if (slot >= 0) {
      const move = slots[slot];
      if (move) link.move(move);
      return;
    }
    if (plain) link.move(plain);
  };

  /** Cues are drained rather than played by the animator — see `anim.ts`. */
  const playCues = () => {
    for (const cue of animator.drainCues()) {
      if (cue.kind === "hop") s.sfx("place", cue.semitones ?? 0);
      else if (cue.kind === "ladder") s.sfx("coin", 5);
      else if (cue.kind === "snake") s.sfx("die");
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;

    const ranked = machine.rankings.indexOf(LOCAL);
    const place =
      ranked >= 0 ? ranked + 1 : placings(machine.state).indexOf(LOCAL) + 1;

    // `onGameOver` is the fallback rather than the pair: a placement is not a
    // score, and a host that had both would show a "0" beside it.
    if (s.onPlaced) s.onPlaced(place, seats.length);
    else s.onGameOver(0);
  };

  return {
    step() {
      tick++;
      if (held && held.left > 0) held.left--;

      // Hit-stop is the animator's, and it means nothing else happens — not
      // the machine's timers, not a bot's thinking.
      if (animator.hitstop > 0) {
        animator.step();
        return;
      }

      if (endFreeze > 0) {
        // The board keeps animating while the beat runs, so the winning hop is
        // seen arriving rather than replaced by a panel.
        endFreeze--;
        animator.step();
        playCues();
        if (endFreeze === 0) finish();
        return;
      }

      handleInput();

      const before = machine.phase;
      machine.step();
      if (runsBots) bots.step();
      link.step();

      // The throw and the landing, the two moments the dice have.
      if (before !== "rolling" && machine.phase === "rolling") s.sfx("jump", -5);
      if (before === "rolling" && machine.phase !== "rolling") s.sfx("land");

      // Held so the face stays up through the move it caused, rather than
      // blanking the die the instant the machine stops needing the number.
      if (machine.roll !== null) lastRoll = machine.roll;

      const events = machine.drainEvents();
      if (events.length) {
        animator.play(events);
        for (const e of events) {
          // The four events the animator has no opinion about, which are the
          // four the cards are made of. A card leaving a hand, a card arriving
          // in one, a snake that did not happen, and a match that ended.
          if (e.kind === "spend") s.sfx("jump", 4);
          else if (e.kind === "card") s.sfx("coin", 9);
          else if (e.kind === "finish") s.sfx("perfect", 4);
          else if (e.kind === "held" && e.to !== undefined) {
            s.sfx("land", 12);
            held = { square: e.to, left: HELD_STEPS };
          }
        }
      }

      animator.step();
      playCues();

      // `animating` has no timer: the animator is the only thing that knows
      // how many squares are left to count, so it is the thing that ends it.
      if (machine.phase === "animating" && !animator.busy) machine.animationDone();

      // A party match ends for everyone at once, when the match does: the
      // host's table is the match, and it cannot stop when its own token is
      // home while the others are still playing on it.
      const placed = !s.net && machine.rankings.includes(LOCAL);
      if ((machine.phase === "matchOver" || placed) && !animator.busy && !ended) {
        endFreeze = END_FREEZE;
      }
    },

    // No `alpha`: every motion on this board is a whole number of steps of a
    // hop, and there is nothing continuous to interpolate between two of them.
    render() {
      renderer.draw(
        s.ctx,
        {
          seats,
          state: machine.state,
          phase: machine.phase,
          activeSeatId: machine.activeSeat.id,
          localSeatId: LOCAL,
          die: machine.roll ?? lastRoll,
          dieProgress: machine.phase === "rolling" ? machine.progress : 1,
          moves: ownMoves(),
          slotMoves: slotMoves(),
          clock:
            machine.clock === null
              ? null
              : { left: machine.clock, span: TURN_TIMER_STEPS },
          thinking: bots.thinking,
          shake: animator.shake,
          tick,
          held,
          tokenView: (id) => animator.view(id),
        },
        s.width,
        s.height
      );
    },

    // No `resize`: the board is fitted to the canvas on every draw, which is
    // what `painter.layout` is.

    destroy() {
      animator.clear();
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
