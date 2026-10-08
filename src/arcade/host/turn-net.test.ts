import test from "node:test";
import assert from "node:assert/strict";
import { createBotDriver, fillSeats } from "./bots";
import { mulberry32 } from "./rng";
import { createTurnMachine, type Decision, type TurnMachine } from "./turn";
import type { RulesModule, Seat } from "./rules";
import { createLudoRules } from "@/arcade/games/ludo/rules";
import { DEFAULT_SETTINGS as LUDO } from "@/arcade/games/ludo/tuning";
import { createSnakesRules } from "@/arcade/games/snakes/rules";
import { DEFAULT_SETTINGS as SNAKES } from "@/arcade/games/snakes/tuning";

/**
 * A networked board match is one host table and some puppet tables that
 * replay its decisions. If a puppet ever disagrees with the host — a die it
 * drew itself, a forced move it played on its own clock — the two boards
 * drift apart silently, and nobody sees it until a token is somewhere it
 * cannot be. So: play whole matches both ways and require identical states.
 */

function playOut<S, M>(rules: RulesModule<S, M>, seed: number, lag: number) {
  const rng = mulberry32(seed);
  const seats: Seat[] = fillSeats({ total: 4, humans: 0, rng, difficulty: "normal" }).map((s, id) =>
    ({ ...s, id, kind: "bot" as const })
  );
  const wire: Decision[] = [];
  const host = createTurnMachine({ rules, seats, seed, rng, onDecision: (d) => wire.push(d) });
  const guest: TurnMachine<S, M> = createTurnMachine({
    rules,
    seats,
    seed,
    // A guest's generator is not the host's, and it must not matter.
    rng: mulberry32(seed ^ 0xdead),
    puppet: true,
  });
  const bots = createBotDriver({ machine: host, rules, rng });
  host.start();
  guest.start();

  for (let step = 0; step < 200_000 && guest.phase !== "matchOver"; step++) {
    if (host.phase !== "matchOver") {
      host.step();
      bots.step();
      host.drainEvents();
      if (host.phase === "animating") host.animationDone();
    }
    // The guest runs behind the host by `lag` steps of network and loading,
    // and still has to end up at the same match.
    if (step >= lag) {
      while (wire.length) guest.apply(wire.shift()!);
      guest.step();
      guest.drainEvents();
      if (guest.phase === "animating") guest.animationDone();
    }
  }
  return { host, guest };
}

for (const [name, rules] of [
  ["ludo", createLudoRules(LUDO)],
  ["snakes", createSnakesRules(SNAKES)],
] as const) {
  test(`${name}: a puppet table replays the host's match exactly`, () => {
    for (const seed of [1, 7, 42]) {
      const { host, guest } = playOut(rules as RulesModule<unknown, unknown>, seed, 90);
      assert.equal(host.phase, "matchOver", `seed ${seed}: the host's match did not finish`);
      assert.equal(guest.phase, "matchOver", `seed ${seed}: the guest never caught up`);
      assert.deepEqual(guest.state, host.state, `seed ${seed}: the boards drifted`);
      assert.deepEqual(guest.rankings, host.rankings);
    }
  });
}

test("a puppet decides nothing by itself", () => {
  const rules = createLudoRules(LUDO);
  const seats: Seat[] = [0, 1, 2, 3].map((id) => ({ id, name: `p${id}`, kind: "human" as const }));
  const guest = createTurnMachine({ rules, seats, seed: 3, rng: mulberry32(3), puppet: true });
  guest.start();
  assert.equal(guest.requestRoll(), false);
  for (let i = 0; i < 5000; i++) guest.step();
  assert.equal(guest.phase, "awaitingRoll", "no turn clock rolled for a player on a puppet");
});

test("a solo match draws its dice exactly as before", () => {
  // No `onDecision`, no puppet: the die is drawn at landing, so a seed still
  // replays the same solo table it always did.
  const rules = createLudoRules(LUDO);
  const run = () => {
    const rng = mulberry32(11);
    const seats = fillSeats({ total: 4, humans: 0, rng });
    const m = createTurnMachine({ rules, seats, seed: 11, rng });
    const b = createBotDriver({ machine: m, rules, rng });
    m.start();
    const rolls: number[] = [];
    for (let i = 0; i < 4000; i++) {
      m.step();
      b.step();
      m.drainEvents();
      if (m.phase === "animating") m.animationDone();
      if (m.phase === "awaitingMove" && m.roll !== null) rolls.push(m.roll);
    }
    return rolls;
  };
  assert.deepEqual(run(), run());
});
