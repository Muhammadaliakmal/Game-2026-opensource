import * as T from "./tuning";

/**
 * Reflex — the rules, with nothing drawn and no clock of its own.
 *
 * ── Pure, seeded, and stepped at a fixed rate ────────────────────────────
 *
 * Every number comes from `tuning.ts`, every random comes from the `rng` the
 * host handed in, and `step` takes the tap rather than reading input. So a run
 * is reproducible from its seed and its taps, which is what lets
 * `sim.test.ts` play three minutes of it in a millisecond and assert that the
 * window closes, the streak pays, and nothing ever leaves the field.
 *
 * ── Why a target does not move ───────────────────────────────────────────
 *
 * Because the window is the difficulty and two difficulties fight. A target
 * that drifts turns a reaction test into a tracking test, and the two skills
 * curve differently: tracking gets easier with practice in a way reaction does
 * not, so the game would flatten out for exactly the players it is meant to
 * keep stretching.
 */

export interface Target {
  /** Stable across frames, so the renderer can keep per-target animation. */
  id: number;
  x: number;
  y: number;
  /** Seconds it has been alive. */
  age: number;
  /** Seconds it gets. Fixed at spawn, so a target's ring never jumps. */
  life: number;
}

/** What the last step did, for the host to turn into sound and juice. */
export type Event = "hit" | "miss" | "expired" | "over";

export interface Sim {
  step(dt: number, tap: { x: number; y: number } | null): void;
  readonly targets: readonly Target[];
  readonly score: number;
  readonly streak: number;
  readonly best: number;
  readonly lives: number;
  readonly hits: number;
  readonly over: boolean;
  /** Events raised by the step just taken. Cleared at the top of each step. */
  readonly events: readonly Event[];
  /** Where the last hit landed, for the burst. Null until there is one. */
  readonly lastHit: { x: number; y: number } | null;
}

/**
 * How far along the difficulty ramp the run is, 0..1.
 *
 * Driven by hits rather than by elapsed time, which matters more than it
 * looks: a player who is missing is not being asked for more speed, and a
 * clock-driven ramp punishes the exact player who is already struggling. It
 * also makes the curve the same for everyone — the fortieth hit is always the
 * hardest one, whether it arrived in forty seconds or four minutes.
 */
export const rampAt = (hits: number): number =>
  Math.min(1, hits / T.RAMP_HITS);

/** Seconds a target spawned now would live. */
export const windowAt = (hits: number): number =>
  T.WINDOW_START + (T.WINDOW_END - T.WINDOW_START) * rampAt(hits);

/** Seconds until the next spawn. */
export const spawnAt = (hits: number): number =>
  T.SPAWN_START + (T.SPAWN_END - T.SPAWN_START) * rampAt(hits);

/** Points a hit is worth at this streak. */
export const pointsFor = (streak: number): number =>
  T.HIT_POINTS + T.STREAK_BONUS * Math.min(streak, T.STREAK_CAP);

export function createSim(rng: () => number): Sim {
  const targets: Target[] = [];
  const events: Event[] = [];

  let nextId = 1;
  let score = 0;
  let streak = 0;
  let best = 0;
  let lives = T.LIVES;
  let hits = 0;
  let over = false;
  let sinceSpawn = 0;
  let lastHit: { x: number; y: number } | null = null;

  /**
   * A spot no live target is sitting on, or null after `PLACE_TRIES`.
   *
   * Rejection sampling with a bounded try count. Giving up is correct: with
   * three targets on a 768x348 field a failure is vanishingly unlikely, and
   * the cost of it is one spawn skipped, while the cost of looping until
   * success is a hung tab inside a fixed timestep.
   */
  function findSpot(): { x: number; y: number } | null {
    for (let i = 0; i < T.PLACE_TRIES; i++) {
      const x = T.EDGE_INSET + rng() * (T.VIEW_W - T.EDGE_INSET * 2);
      const y = T.EDGE_INSET + rng() * (T.VIEW_H - T.EDGE_INSET * 2);
      let clear = true;
      for (const t of targets) {
        const dx = t.x - x;
        const dy = t.y - y;
        if (dx * dx + dy * dy < T.MIN_SEPARATION * T.MIN_SEPARATION) {
          clear = false;
          break;
        }
      }
      if (clear) return { x, y };
    }
    return null;
  }

  return {
    step(dt, tap) {
      events.length = 0;
      if (over) return;

      /*
       * The tap is resolved before ageing, not after.
       *
       * A target on its very last frame should be a hit if the player touched
       * it on that frame. Ageing first would expire it a few milliseconds
       * early and cost a life for a tap that landed — which is the single
       * unfairness a game built entirely out of reaction time cannot afford.
       */
      if (tap) {
        let struck = -1;
        let bestDistSq = Infinity;
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const dx = t.x - tap.x;
          const dy = t.y - tap.y;
          const d2 = dx * dx + dy * dy;
          // Nearest centre wins, so a tap between two touching targets is
          // never ambiguous even though `MIN_SEPARATION` says it cannot
          // happen.
          if (d2 <= T.TARGET_R * T.TARGET_R && d2 < bestDistSq) {
            bestDistSq = d2;
            struck = i;
          }
        }

        if (struck >= 0) {
          const t = targets[struck];
          score += pointsFor(streak);
          streak++;
          if (streak > best) best = streak;
          hits++;
          lastHit = { x: t.x, y: t.y };
          targets.splice(struck, 1);
          events.push("hit");
        } else {
          // Empty space. The streak goes and nothing else does — see the note
          // on `LIVES` in tuning.
          streak = 0;
          events.push("miss");
        }
      }

      // Age, and take a life for anything that ran out.
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.age += dt;
        if (t.age < t.life) continue;
        targets.splice(i, 1);
        streak = 0;
        lives--;
        events.push("expired");
        if (lives <= 0) {
          over = true;
          events.push("over");
          // Everything still on screen goes, so the freeze shows an empty
          // field rather than targets quietly expiring behind the panel.
          targets.length = 0;
          return;
        }
      }

      sinceSpawn += dt;
      if (targets.length < T.MAX_TARGETS && sinceSpawn >= spawnAt(hits)) {
        sinceSpawn = 0;
        const spot = findSpot();
        if (spot) {
          targets.push({
            id: nextId++,
            x: spot.x,
            y: spot.y,
            age: 0,
            life: windowAt(hits),
          });
        }
      }
    },
    get targets() {
      return targets;
    },
    get score() {
      return score;
    },
    get streak() {
      return streak;
    },
    get best() {
      return best;
    },
    get lives() {
      return lives;
    },
    get hits() {
      return hits;
    },
    get over() {
      return over;
    },
    get events() {
      return events;
    },
    get lastHit() {
      return lastHit;
    },
  };
}
