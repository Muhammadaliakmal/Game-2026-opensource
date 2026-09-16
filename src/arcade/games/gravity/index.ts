import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { createTap, fitView, toView } from "@/arcade/host/view";
import { createSim, DIRS, type Dir } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * Gravity Shift — the game, wired to the host.
 *
 * ── A tap is a direction ─────────────────────────────────────────────────
 *
 * On touch, a tap anywhere sets down to whichever side of the ball the
 * finger is on — the larger of the horizontal and vertical offsets from the
 * ball wins. No buttons: the whole screen is the compass, and the chevrons
 * round the edge of the room are the only hint that it is. On a keyboard
 * the arrows and WASD are the four directions, on the press.
 */

const KEYS: Array<[string, Dir]> = [
  ["ArrowDown", "down"],
  ["KeyS", "down"],
  ["ArrowUp", "up"],
  ["KeyW", "up"],
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
  ["ArrowRight", "right"],
  ["KeyD", "right"],
];

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim();
  const renderer = createRenderer(s.rng);
  const tap = createTap();
  const keyWas: Record<string, boolean> = {};

  let shake = 0;
  let ended = false;

  const keyEdge = (code: string) => {
    const now = s.input.keys[code] === true;
    const was = keyWas[code] === true;
    keyWas[code] = now;
    return now && !was;
  };

  const readInput = () => {
    for (const [code, dir] of KEYS) {
      if (keyEdge(code)) sim.flip(dir);
    }
    if (tap(s.input.pointer.down)) {
      const view = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
      const p = toView(view, s.input.pointer.x, s.input.pointer.y);
      const dx = p.x - sim.px;
      const dy = p.y - T.HUD_H - sim.py;
      if (Math.abs(dx) >= Math.abs(dy)) sim.flip(dx > 0 ? "right" : "left");
      else sim.flip(dy > 0 ? "down" : "up");
    }
  };

  return {
    step(dt) {
      renderer.step(dt);
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);
      if (ended) return;

      readInput();
      sim.step(dt);

      switch (sim.event) {
        case "flip":
          s.sfx("place", sim.flips % 4);
          break;
        case "land": {
          const [gx, gy] = DIRS[sim.gravity];
          if (sim.landSpeed > T.HARD_LANDING) {
            s.sfx("land");
            renderer.puff(sim.px, sim.py, gx, gy);
          }
          break;
        }
        case "coin":
          s.sfx("coin", Math.min(12, sim.coins * 2));
          break;
        case "glass":
          s.sfx("perfect", -4);
          shake = T.SHAKE_PX * 0.6;
          break;
        case "die":
          s.sfx("die");
          shake = T.SHAKE_PX;
          break;
        case "clear":
          s.sfx("perfect", Math.min(12, sim.level * 2));
          break;
        case "level":
          s.sfx("coin", 7);
          break;
        case "won":
          s.sfx("perfect", 12);
          break;
        case "lost":
          s.sfx("die", -5);
          break;
      }

      s.onScore(sim.score);
      if (sim.phase === "done") {
        ended = true;
        s.onGameOver(sim.score);
      }
    },

    render(alpha) {
      renderer.draw(s.ctx, sim, sim.phase === "play" ? alpha : 0, shake, s.width, s.height);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
