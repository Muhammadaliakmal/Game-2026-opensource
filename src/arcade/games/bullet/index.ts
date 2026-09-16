import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { fitView, toView } from "@/arcade/host/view";
import { createSim } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * One Bullet — the game, wired to the host.
 *
 * ── Drag to aim, let go to fire ──────────────────────────────────────────
 *
 * On touch, the finger's first contact is an anchor and the drag from it is
 * the direction of the shot: swipe toward what you want to hit. The finger
 * can be anywhere on the screen, so it never covers the room it is aiming
 * at, and the aim line does the pointing. Releasing fires; releasing with
 * the drag shorter than `CANCEL_PX` fires nothing, so a tap to think is not
 * a shot spent.
 *
 * On a keyboard the arrows (or A/D, W/S) turn the barrel at `AIM_RATE`,
 * Shift slows it to `AIM_FINE` for the last degree, and Space fires.
 */

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim();
  const renderer = createRenderer(s.rng);

  let anchorX = 0;
  let anchorY = 0;
  let dragged = false;
  let wasDown = false;
  let wasSpace = false;
  let shake = 0;
  let ended = false;

  const readInput = (dt: number) => {
    if (sim.phase !== "aim") {
      // A finger that was down when the shot left stays a non-event until
      // it lifts, so the next room does not start with a half-drag.
      wasDown = s.input.pointer.down;
      wasSpace = s.input.keys.Space === true;
      return;
    }

    // Keys.
    const fine = s.input.keys.ShiftLeft === true || s.input.keys.ShiftRight === true;
    const turn = s.input.axis.x + s.input.axis.y;
    if (turn !== 0) sim.aim(sim.angle + Math.max(-1, Math.min(1, turn)) * (fine ? T.AIM_FINE : T.AIM_RATE) * dt);
    const space = s.input.keys.Space === true;
    if (space && !wasSpace) sim.fire();
    wasSpace = space;

    // Pointer.
    const down = s.input.pointer.down;
    if (down) {
      const view = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
      const p = toView(view, s.input.pointer.x, s.input.pointer.y);
      if (!wasDown) {
        anchorX = p.x;
        anchorY = p.y;
        dragged = false;
      } else {
        const dx = p.x - anchorX;
        const dy = p.y - anchorY;
        if (Math.hypot(dx, dy) >= T.CANCEL_PX) {
          dragged = true;
          sim.aim(Math.atan2(dy, dx));
        }
      }
    } else if (wasDown && dragged) {
      sim.fire();
    }
    wasDown = down;
  };

  return {
    step(dt) {
      renderer.step(dt);
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);
      if (ended) return;

      readInput(dt);
      sim.step(dt);

      switch (sim.event) {
        case "fire":
          s.sfx("jump", -3);
          break;
        case "bounce":
          s.sfx("place", sim.bounces);
          break;
        case "mirror":
          s.sfx("place", 7);
          break;
        case "glass":
          s.sfx("perfect", -4);
          renderer.burst(sim.bx, sim.by, "#c8f0ff", 8);
          shake = T.SHAKE_PX * 0.4;
          break;
        case "switch":
          s.sfx("coin", -5);
          break;
        case "crate":
          s.sfx("land");
          shake = T.SHAKE_PX * 0.5;
          break;
        case "boom":
          s.sfx("die", 6);
          renderer.burst(sim.bx, sim.by, "#ff3d6a", 20);
          shake = T.SHAKE_PX;
          break;
        case "target":
          s.sfx("coin", Math.min(12, (sim.targetsLeft === 0 ? 6 : 3) + sim.bounces * 2));
          renderer.burst(sim.bx, sim.by, "#7dffb0", 10);
          break;
        case "spent":
          s.sfx("close");
          break;
        case "clear":
          // A clear lands on a target or a charge and takes the event slot
          // from it, so the burst it would have had comes with the clear.
          s.sfx("perfect", Math.min(12, sim.level * 2));
          renderer.burst(sim.bx, sim.by, "#7dffb0", 16);
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
      renderer.draw(s.ctx, sim, sim.phase === "flight" ? alpha : 0, shake, s.width, s.height);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
