import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { createSim } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * Tower Stack — the whole game, wired to the host.
 *
 * The same shape as Chunk Runner: numbers in `tuning.ts`, movement in
 * `sim.ts`, drawing in `render.ts`, and this file turning the host's input map
 * into the one boolean the simulation takes.
 *
 * It uses no `rng` at all, which is worth saying out loud: the block's path is
 * a ping-pong and the tower is whatever the player made of it, so there is
 * nothing to seed. A run is reproducible from its inputs alone.
 */

const DROP_KEYS = ["Space", "KeyW", "ArrowUp", "Enter"] as const;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim();
  const renderer = createRenderer();

  let wasDown = false;
  let flash = 0;
  let comboAge = T.COMBO_TIME;
  let deathFreeze = 0;
  let ended = false;

  const down = () => {
    if (s.input.pointer.down) return true;
    for (let i = 0; i < DROP_KEYS.length; i++) {
      if (s.input.keys[DROP_KEYS[i]]) return true;
    }
    return false;
  };

  return {
    step(dt) {
      const held = down();
      // The edge only. A held button must not drop a block a frame, which at
      // sixty frames a second would end the run before the finger lifted.
      const pressed = held && !wasDown;
      wasDown = held;

      if (flash > 0) flash = Math.max(0, flash - dt);
      comboAge += dt;

      if (ended) return;

      if (deathFreeze > 0) {
        deathFreeze--;
        if (deathFreeze === 0) {
          ended = true;
          s.onGameOver(sim.score);
        }
        // The simulation still steps while frozen, so the missed block is seen
        // falling. That is the whole point of the pause: a run that cuts to a
        // score screen never shows the player what they did.
        sim.step(dt, false);
        return;
      }

      sim.step(dt, pressed);

      if (sim.drop === "perfect") {
        flash = T.FLASH_TIME;
        comboAge = 0;
        s.sfx("perfect", Math.min(T.COMBO_PITCH_MAX, sim.combo - 1));
      } else if (sim.drop === "placed") {
        s.sfx("place");
        // The near miss. This is the sound "one more try" is made of: the
        // block landed, but only just, and the sting says so before the
        // player has read the width.
        if (sim.kept < T.NEAR_MISS_KEPT) s.sfx("close");
      } else if (sim.drop === "missed") {
        s.sfx("die");
        // Longer than Chunk Runner's, because the thing worth watching here
        // is the block falling past the tower rather than an impact.
        deathFreeze = 30;
      }

      s.onScore(sim.score);
    },

    render(alpha) {
      renderer.draw(
        s.ctx,
        sim,
        ended || deathFreeze > 0 ? 1 : alpha,
        s.width,
        s.height,
        flash,
        comboAge
      );
    },

    // No `resize`, for the same reason Chunk Runner has none: the game is
    // played at a fixed view size and letterboxed into whatever the canvas is.

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
