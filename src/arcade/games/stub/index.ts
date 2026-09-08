import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";

/**
 * The host's own test pattern: a square crossing the canvas at exactly 200
 * pixels a second.
 *
 * Not a game and never listed on a cabinet — `registry.ts` marks it `dev`. It
 * exists so the host can be verified without a game to blame: if the square
 * drifts from 200 px/s on any panel, the fixed timestep is wrong, and if it
 * stutters, the interpolation is. Both are the host's problems, and both are
 * much harder to see once a real game is drawing over them.
 *
 * It also demonstrates the two rules every game module follows: no allocation
 * inside `step` or `render`, and no state written outside `step`.
 */

const SPEED = 200;
const SIZE = 48;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  // All state up front. Nothing below this line allocates.
  let x = 0;
  let prevX = 0;
  let dir = 1;
  let seconds = 0;
  let steps = 0;

  return {
    step(dt) {
      prevX = x;
      x += SPEED * dir * dt;
      const max = Math.max(0, s.width - SIZE);
      if (x >= max) {
        x = max;
        dir = -1;
      } else if (x <= 0) {
        x = 0;
        dir = 1;
      }
      seconds += dt;
      steps++;
      // The score is the step count, which is the number the host's own claim
      // is about: after ten seconds on any display it should read 600.
      s.onScore(steps);
    },

    render(alpha) {
      const { ctx, width, height } = s;
      ctx.fillStyle = "#0b1030";
      ctx.fillRect(0, 0, width, height);

      // Drawn between the last two sim positions, which is the whole reason
      // `render` takes an alpha: at 144Hz most frames fall between steps.
      const ix = prevX + (x - prevX) * alpha;
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(Math.round(ix), Math.round(height / 2 - SIZE / 2), SIZE, SIZE);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`${steps} steps · ${seconds.toFixed(1)}s`, 12, 20);
    },

    destroy() {
      // Nothing retained: no images, no audio nodes, no timers.
    },
  };
};

const module_: GameModule = { create };
export default module_;
