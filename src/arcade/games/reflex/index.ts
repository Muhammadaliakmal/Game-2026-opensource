import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { createTap, fitView, toView } from "@/arcade/host/view";
import { createSim } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * Reflex — the whole game, wired to the host.
 *
 * The same shape as every cabinet before it: numbers in `tuning.ts`, rules in
 * `sim.ts`, drawing in `render.ts`, and this file turning the host's input
 * into the one thing the simulation takes — a tap, in view coordinates, or
 * null.
 *
 * ── The pointer has to be converted, and that is the only seam ───────────
 *
 * `input.pointer` is in canvas pixels; the game is simulated in a fixed
 * 960x540 view that is letterboxed into whatever canvas the host has. A tap
 * compared against a target without running that transform backwards is a tap
 * that lands somewhere else on every screen size — and on a phone, where the
 * letterbox bars are widest, it is off by most of the field. `toView` is the
 * same arithmetic the renderer uses forwards, which is why it lives in the
 * host rather than here.
 *
 * ── Keyboard is deliberately not a way to play ───────────────────────────
 *
 * There is no key that means "hit the target at this position". The hint in
 * the registry says mouse or touch for both inputs, because inventing a
 * keyboard scheme — cycle with Tab, confirm with Space — would be a different
 * and much easier game wearing this one's name.
 */

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim(s.rng);
  const renderer = createRenderer();
  const tapped = createTap();

  let burst = 0;
  let shake = 0;
  let freeze = 0;
  let ended = false;
  let reported = -1;

  return {
    step(dt) {
      if (burst > 0) burst = Math.max(0, burst - dt);
      if (shake > 0) shake = Math.max(0, shake - dt);

      if (ended) return;

      /*
       * The freeze after the last life.
       *
       * The simulation is over by this point and nothing is stepped — unlike
       * Tower Stack, where the block is still falling and the pause exists to
       * show it land. Here the last thing that happened was a target vanishing,
       * which the shake has already reported, so the freeze is only there to
       * stop the score panel arriving on the same frame as the mistake.
       */
      if (freeze > 0) {
        freeze -= dt;
        if (freeze <= 0) {
          ended = true;
          s.onGameOver(sim.score);
        }
        return;
      }

      const press = tapped(s.input.pointer.down);
      let tap: { x: number; y: number } | null = null;
      if (press) {
        const v = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
        tap = toView(v, s.input.pointer.x, s.input.pointer.y);
      }

      sim.step(dt, tap);

      for (const event of sim.events) {
        if (event === "hit") {
          burst = T.BURST_TIME;
          // The pitch climbs with the streak — the cheapest juice there is.
          // `streak` has already been incremented, so the first hit is +0.
          s.sfx(
            "coin",
            Math.min(T.PITCH_MAX, (sim.streak - 1) * T.PITCH_PER_STREAK)
          );
        } else if (event === "miss") {
          s.sfx("close");
        } else if (event === "expired") {
          shake = T.SHAKE_TIME;
          s.sfx("die");
        } else if (event === "over") {
          freeze = T.DEATH_FREEZE;
        }
      }

      // Throttled by the host to ~10Hz, but only worth sending when it moved.
      if (sim.score !== reported) {
        reported = sim.score;
        s.onScore(sim.score);
      }
    },

    render(_alpha, svc) {
      /*
       * `alpha` is ignored, and that is correct rather than lazy.
       *
       * Interpolation exists so motion between two sim steps is smooth.
       * Nothing in this game moves: a target appears, sits still, and goes.
       * The only animated values are the ring, the burst and the shake, all
       * driven by timers that already advance every step. Lerping a static
       * position against itself is arithmetic that produces the same number.
       */
      renderer.draw(svc.ctx, sim, svc.width, svc.height, burst, shake, svc.rng);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

const mod: GameModule = { create };
export default mod;
