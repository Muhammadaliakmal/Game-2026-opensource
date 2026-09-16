import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { fitView, toView } from "@/arcade/host/view";
import { createSim, type SimInput } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * ECHO — the game, wired to the host.
 *
 * `tuning.ts` has the numbers, `levels.ts` the rooms, `sim.ts` moves things
 * and is tested, `render.ts` draws. This file turns the host's input into the
 * one thing the simulation understands — a direction — and its one-step
 * events into sound.
 *
 * ── Touch is a floating stick ────────────────────────────────────────────
 *
 * The finger's first touch is the stick's centre and the drag from it is the
 * direction. Nothing is drawn for it: the cabinet is small, the room needs
 * the space, and a stick you cannot see is one you cannot miss. Keys are the
 * host's own axis. The two add, so a phone with a keyboard works as both.
 */

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim();
  const renderer = createRenderer(s.rng);
  const input: SimInput = { ax: 0, ay: 0 };

  let anchorX = 0;
  let anchorY = 0;
  let wasDown = false;
  let shake = 0;
  let ended = false;
  let lastLoop = 0;
  let lastLevel = 0;

  const readInput = () => {
    let ax = s.input.axis.x;
    let ay = s.input.axis.y;

    const down = s.input.pointer.down;
    if (down) {
      const view = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
      const p = toView(view, s.input.pointer.x, s.input.pointer.y);
      if (!wasDown) {
        anchorX = p.x;
        anchorY = p.y;
      }
      const dx = p.x - anchorX;
      const dy = p.y - anchorY;
      const d = Math.hypot(dx, dy);
      if (d > T.STICK_DEADZONE) {
        const k = Math.min(1, (d - T.STICK_DEADZONE) / (T.STICK_RADIUS - T.STICK_DEADZONE)) / d;
        ax += dx * k;
        ay += dy * k;
      }
    }
    wasDown = down;

    input.ax = Math.max(-1, Math.min(1, ax));
    input.ay = Math.max(-1, Math.min(1, ay));
  };

  return {
    step(dt) {
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);
      if (ended) return;

      readInput();
      sim.step(dt, input);

      switch (sim.event) {
        case "door":
          s.sfx("place", sim.onPlate ? 4 : 0);
          break;
        case "caught":
          s.sfx("die");
          shake = T.SHAKE_PX;
          break;
        case "timeout":
          s.sfx("close");
          break;
        case "exit":
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

      // The loop rolling over is its own beat, separate from what ended the run.
      if (sim.loop !== lastLoop && sim.phase === "run") {
        s.sfx("jump", sim.loop * 2);
        lastLoop = sim.loop;
      }
      if (sim.level !== lastLevel) {
        lastLevel = sim.level;
        lastLoop = 0;
      }

      s.onScore(sim.score);

      if (sim.phase === "done") {
        ended = true;
        s.onGameOver(sim.score);
      }
    },

    render(alpha) {
      renderer.draw(s.ctx, sim, sim.phase === "run" ? alpha : 0, shake, s.width, s.height);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
