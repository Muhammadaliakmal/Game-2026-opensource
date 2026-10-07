import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { createTap, fitView, toView } from "@/arcade/host/view";
import { reducedMotion } from "@/lib/motion";
import { HAPTIC, haptic } from "@/lib/player-settings";
import { createSim } from "./sim";
import { boardLayout, createRenderer, HINT_BTN } from "./render";
import { loadArt } from "./art";
import * as T from "./tuning";

/**
 * Untwine — the game, wired to the host.
 *
 * ── Input ────────────────────────────────────────────────────────────────
 *
 * One verb: tap a line. The tap lands on whichever line owns that cell, or
 * the nearest one within half a cell (see `tapCell`), because a thumb is
 * wider than a line and a miss that costs nothing is worse than a near miss
 * that counts. The hint is a button in the HUD and `H` on a keyboard.
 *
 * ── A run ────────────────────────────────────────────────────────────────
 *
 * Boards one after another, bigger each time, on three hearts for the whole
 * run. The run ends when the hearts do. It has no top, so it pays like the
 * other endless cabinets (`lib/arcade-payout.ts`). The best level reached
 * is remembered on this device and shown on the last screen.
 */

const BEST_KEY = "blockworld.untwine.best.v1";

function readBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeBest(level: number) {
  try {
    if (level > readBest()) localStorage.setItem(BEST_KEY, String(level));
  } catch {
    /* a best that is not saved is still a run that happened */
  }
}

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  // The run's seed comes from the host's seeded stream, so a run is
  // reproducible from the host seed and no two runs deal the same boards.
  const sim = createSim(Math.floor(s.rng() * 0xffffffff) >>> 0);
  const calm = reducedMotion();
  const renderer = createRenderer(s.rng, calm);
  const tap = createTap();
  const best = readBest();
  let hWas = false;
  let shake = 0;
  let ended = false;

  const readInput = () => {
    const h = s.input.keys.KeyH === true;
    if (h && !hWas) sim.hint();
    hWas = h;

    if (!tap(s.input.pointer.down)) return;
    const view = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
    const p = toView(view, s.input.pointer.x, s.input.pointer.y);
    const b = HINT_BTN;
    // A little slop round the button: it sits in a corner a thumb reaches
    // for, not aims at.
    if (p.x >= b.x - 8 && p.x <= b.x + b.w + 8 && p.y >= b.y - 8 && p.y <= b.y + b.h + 8) {
      sim.hint();
      return;
    }
    const L = boardLayout(sim.board);
    sim.tapCell((p.x - L.ox) / L.cell, (p.y - L.oy) / L.cell);
  };

  return {
    step(dt) {
      renderer.step(dt);
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);
      if (ended) return;

      // Step first, then read input: `step` clears last step's events, and
      // a tap's events must survive to be heard below.
      sim.step(dt);
      readInput();

      for (const e of sim.events) {
        switch (e.type) {
          case "pull": {
            const chain = Math.min(e.chain, T.CHAIN_CAP);
            s.sfx("swish", Math.min(12, chain));
            renderer.pulled(sim, e.id, T.PULL_POINTS + T.CHAIN_POINTS * chain, e.chain);
            haptic(HAPTIC.tap);
            break;
          }
          case "exit":
            renderer.exit(sim, e.id);
            break;
          case "bump":
            s.sfx("thunk");
            if (!calm) shake = T.SHAKE_PX;
            haptic(HAPTIC.fail);
            break;
          case "heartLost":
            s.sfx("close", -2);
            break;
          case "heal":
            s.sfx("coin", 12);
            renderer.heartChanged();
            break;
          case "hint":
            s.sfx("place", 7);
            break;
          case "clear":
            s.sfx("perfect", Math.min(12, sim.level));
            renderer.confetti();
            haptic(HAPTIC.event);
            break;
          case "lost":
            s.sfx("die");
            break;
          case "deal":
            s.sfx("land");
            break;
        }
      }

      s.onScore(sim.score);
      if (sim.phase === "done") {
        ended = true;
        writeBest(sim.level);
        s.onGameOver(sim.score);
      }
    },

    render() {
      // Shake is a decaying jitter computed from the shake itself — render
      // must not draw from the seeded stream, or drawing would change the run.
      const k = shake;
      const off = { x: Math.sin(k * 97) * k, y: Math.cos(k * 71) * k };
      renderer.draw(s.ctx, sim, off, s.width, s.height, best);
    },

    destroy() {},
  };
};

const module_: GameModule = { create, preload: loadArt };
export default module_;
