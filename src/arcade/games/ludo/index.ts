import { createAnimator } from "@/arcade/host/anim";
import { createPainter } from "@/arcade/host/board";
import { createBotDriver, fillSeats } from "@/arcade/host/bots";
import { TURN_TIMER_STEPS, createTurnMachine } from "@/arcade/host/turn";
import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { reducedMotion } from "@/lib/motion";
import { IN_YARD, LUDO_GRAPH, cellFor } from "./board";
import {
  createLudoRules,
  placings,
  tokenIdOf,
  type LudoMove,
  type LudoState,
} from "./rules";
import { createRenderer } from "./render";
import { DEFAULT_SETTINGS } from "./tuning";

/**
 * Ludo — the turn machine, the animator, the bots and the board, wired to the
 * host.
 *
 * The same shape as the runners: numbers in `tuning.ts`, the game in
 * `rules.ts`, drawing in `render.ts`, and this file turning the host's input
 * map into the two things a board game can be told — *roll*, and *move that
 * one*. What is different is that almost none of it is here: the phase machine
 * and the animation queue are the host's, and this file is mostly the order
 * they run in.
 *
 * ── That order is the load-bearing part ──────────────────────────────────
 *
 * Input, then the machine, then the seats, then the animator. Reversed, a tap
 * would be read against a phase the player never saw — you would press the die
 * on the frame the turn passed to somebody else and the press would land on
 * their turn.
 *
 * ── The run ends when *you* are placed ───────────────────────────────────
 *
 * Not when the match resolves. `onGameOver` fires once and puts up the result
 * screen, so a game that carried on settling 2nd and 3rd behind it would be a
 * game with no way to say so. See `plan-phase8.md` §2D. With Quick Ludo's
 * `endOnFirstWin` those are the same moment anyway, which is most of why that
 * default is the right one.
 */

const SEATS = 4;

/** The seat the person holding the phone plays. `fillSeats` puts them first. */
const LOCAL = 0;

/** A beat after the last token lands, before the result screen. */
const END_FREEZE = 42;

const ROLL_KEYS = ["Space", "Enter", "KeyW", "ArrowUp"] as const;
const PICK_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"] as const;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const rules = createLudoRules(DEFAULT_SETTINGS);

  // Everything random about a match comes off the host's seeded generator, so
  // a seed replays the same table: the same bots, the same names, the same
  // dice, the same mistakes.
  const seed = Math.floor(s.rng() * 0xffffffff) >>> 0;
  const seats = fillSeats({ total: SEATS, rng: s.rng, difficulty: "normal" });

  const machine = createTurnMachine<LudoState, LudoMove>({
    rules,
    seats,
    seed,
    rng: s.rng,
  });
  const painter = createPainter(LUDO_GRAPH);
  const animator = createAnimator({
    positionOf: (cell) => painter.at(cell),
    // Read live, so turning the setting on mid-match takes effect on the next
    // hop rather than on the next run.
    reduced: reducedMotion,
  });
  const bots = createBotDriver({ machine, rules, rng: s.rng });
  const renderer = createRenderer(painter);

  const state = machine.state;
  for (let seat = 0; seat < seats.length; seat++) {
    for (let t = 0; t < state.settings.tokens; t++) {
      animator.place(tokenIdOf(seat, t), cellFor(seat, IN_YARD, t));
    }
  }
  machine.start();

  let tick = 0;
  let lastRoll = 1;
  let wasDown = false;
  const keyWas: Record<string, boolean> = {};
  let endFreeze = 0;
  let ended = false;

  /** A key going down this step, rather than being held. */
  const edge = (code: string) => {
    const now = s.input.keys[code] === true;
    const was = keyWas[code] === true;
    keyWas[code] = now;
    return now && !was;
  };

  /** The local player's moves, or nothing — a bot's hand is not shown. */
  const ownMoves = (): readonly LudoMove[] =>
    machine.phase === "awaitingMove" && machine.activeSeat.id === LOCAL
      ? machine.moves
      : [];

  const cellOfMove = (m: LudoMove) => cellFor(LOCAL, m.from, m.token);

  const handleInput = () => {
    const down = s.input.pointer.down;
    const tapped = down && !wasDown;
    wasDown = down;

    // Every key edge is read every step whether or not it can be used, so a
    // key held through a phase change is not re-read as a fresh press on the
    // other side of it.
    let rolled = false;
    for (const code of ROLL_KEYS) if (edge(code)) rolled = true;
    const picks = PICK_KEYS.map((code) => edge(code));

    if (machine.activeSeat.id !== LOCAL) return;

    if (machine.phase === "awaitingRoll") {
      // A tap anywhere throws the dice. Hit-testing the die itself would be a
      // 60-pixel target on a phone in the corner of the board, and there is
      // nothing else to press in this phase.
      if (tapped || rolled) machine.requestRoll();
      return;
    }

    if (machine.phase !== "awaitingMove") return;

    const moves = machine.moves;
    for (let i = 0; i < picks.length && i < moves.length; i++) {
      if (picks[i]) {
        machine.chooseMove(moves[i]);
        return;
      }
    }

    if (!tapped) return;
    const cell = painter.cellAt(s.input.pointer.x, s.input.pointer.y);
    if (cell === null) return;

    // The piece first, then where it would land. Both are accepted because
    // both are things a player means by pointing, and the piece wins the tie:
    // one token's destination can be another's square — a token on 5 and one
    // on 8 with a three showing — and "move this one" is what a finger on a
    // piece means.
    const onPiece = moves.find((m) => cellOfMove(m) === cell);
    if (onPiece) {
      machine.chooseMove(onPiece);
      return;
    }
    const onTarget = moves.find((m) => cellFor(LOCAL, m.to, m.token) === cell);
    if (onTarget) machine.chooseMove(onTarget);
  };

  /** Cues are drained rather than played by the animator — see `anim.ts`. */
  const playCues = () => {
    for (const cue of animator.drainCues()) {
      if (cue.kind === "hop") s.sfx("place", cue.semitones ?? 0);
      else if (cue.kind === "capture") s.sfx("die");
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;

    // Placed if you got home; otherwise the standing you were in when the
    // match stopped, which with `endOnFirstWin` is most matches.
    const ranked = machine.rankings.indexOf(LOCAL);
    const place =
      ranked >= 0 ? ranked + 1 : placings(machine.state).indexOf(LOCAL) + 1;

    // `onGameOver` is the fallback rather than the pair: a placement is not a
    // score, and a host that has both would otherwise show "0" beside it.
    if (s.onPlaced) s.onPlaced(place, seats.length);
    else s.onGameOver(0);
  };

  return {
    step() {
      tick++;

      // Hit-stop is the animator's, and it means nothing else happens — not
      // the machine's timers, not a bot's thinking. Decayed by stepping the
      // animator, which is the thing that owns the count.
      if (animator.hitstop > 0) {
        animator.step();
        return;
      }

      if (endFreeze > 0) {
        // The board keeps animating while the beat runs, so the last token is
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
      bots.step();

      // The throw and the landing, which are the two moments the dice have.
      if (before !== "rolling" && machine.phase === "rolling") s.sfx("jump", -5);
      if (before === "rolling" && machine.phase !== "rolling") s.sfx("land");

      // Held so the face stays up through the move it caused, rather than
      // blanking the die the instant the machine stops needing the number.
      if (machine.roll !== null) lastRoll = machine.roll;

      const events = machine.drainEvents();
      if (events.length) {
        animator.play(events);
        for (const e of events) if (e.kind === "enterHome") s.sfx("perfect", 4);
      }

      animator.step();
      playCues();

      // `animating` has no timer: the animator is the only thing that knows
      // how many cells are left to hop, so it is the thing that ends the phase.
      if (machine.phase === "animating" && !animator.busy) machine.animationDone();

      const placed = machine.rankings.includes(LOCAL);
      if ((machine.phase === "matchOver" || placed) && !animator.busy && !ended) {
        endFreeze = END_FREEZE;
      }
    },

    // No `alpha`: everything on this board moves in whole steps of a hop, and
    // there is no continuous motion to interpolate between two of them.
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
          moveCells: ownMoves().map(cellOfMove),
          clock:
            machine.clock === null
              ? null
              : { left: machine.clock, span: TURN_TIMER_STEPS },
          thinking: bots.thinking,
          shake: animator.shake,
          tick,
          tokenView: (id) => animator.view(id),
        },
        s.width,
        s.height
      );
    },

    // No `resize`: the board is fitted to the canvas on every draw, which is
    // what `painter.layout` is, so there is nothing to recompute on a change
    // of size that is not already recomputed every frame.

    destroy() {
      animator.clear();
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
