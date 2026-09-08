import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { createSim, type SimInput } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * Chunk Runner — the whole game, wired to the host.
 *
 * Three files with one job each: `tuning.ts` holds every number, `sim.ts`
 * moves things and is tested, `render.ts` draws and is not. This file is the
 * seam: it turns the host's input map into the two booleans the simulation
 * understands, and turns the simulation's one-step flags into sound and dust.
 *
 * ── Death is not instant, on purpose ─────────────────────────────────────
 *
 * A run that ends the frame it ends gives the player nothing to read. Eight
 * frames of freeze and a decaying shake is long enough to see what killed you
 * and short enough that `R` still feels immediate — and it is the difference
 * between "I hit that spike" and "it just ended".
 */

/** Which keys count as the one input. Held and pressed are both needed. */
const JUMP_KEYS = ["Space", "KeyW", "ArrowUp", "Enter"] as const;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  // Both at the fixed view size, never at the canvas size — see VIEW_W in
  // tuning.ts. It is what makes a resize purely a drawing concern and keeps
  // one run one difficulty on every device.
  const sim = createSim(s.rng, T.VIEW_W, T.VIEW_H);
  const renderer = createRenderer(s.rng);

  // The one input, reused every step. A fresh object here would be an
  // allocation sixty times a second for two booleans.
  const input: SimInput = { jumpPressed: false, jumpHeld: false };

  let wasHeld = false;
  let shake = 0;
  let deathFreeze = 0;
  let ended = false;

  const held = () => {
    if (s.input.pointer.down) return true;
    for (let i = 0; i < JUMP_KEYS.length; i++) {
      if (s.input.keys[JUMP_KEYS[i]]) return true;
    }
    return false;
  };

  return {
    step(dt) {
      // The edge is derived here rather than read from the host's own
      // `pressed()`, because this game's "jump" is four keys and a tap at
      // once, and one press of any of them is one jump.
      const down = held();
      input.jumpPressed = down && !wasHeld;
      input.jumpHeld = down;
      wasHeld = down;

      renderer.step(dt);
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);

      if (ended) return;

      if (deathFreeze > 0) {
        // The hit stop. The simulation is already dead; this is only the pause
        // before the death screen replaces it.
        deathFreeze--;
        if (deathFreeze === 0) {
          ended = true;
          s.onGameOver(sim.score);
        }
        return;
      }

      const before = sim.dead;
      sim.step(dt, input);

      if (sim.tookCoin) {
        // Pitch climbs with the streak, which is what turns a line of gold
        // into a phrase rather than five identical beeps.
        s.sfx("coin", Math.min(T.COIN_PITCH_MAX, sim.streak - 1));
      }
      if (sim.landed) {
        s.sfx("land");
        renderer.puff(sim.px, sim.py + T.PLAYER_H, s.rng);
      }
      if (input.jumpPressed && !sim.onGround && before === null && !sim.dead) {
        // Only when the press actually became a jump: the sim leaves the
        // ground on the same step, so this is the one honest place to hear it.
        s.sfx("jump");
      }

      s.onScore(sim.score);

      if (!before && sim.dead) {
        s.sfx("die");
        shake = T.SHAKE_PX;
        deathFreeze = T.HIT_STOP_STEPS;
        renderer.puff(sim.px, sim.py + T.PLAYER_H, s.rng);
      }
    },

    render(alpha) {
      // Frozen on the death frame: interpolating past the moment of impact
      // would slide the runner into the thing that killed it while the screen
      // is shaking about it.
      const a = ended || deathFreeze > 0 ? 0 : alpha;
      renderer.draw(s.ctx, sim, a, shake, s.width, s.height);
    },

    // No `resize`: the game is simulated and drawn at a fixed view size and
    // letterboxed into whatever the canvas is, so there is nothing for a size
    // change to invalidate. That is the whole reason for the fixed view.

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
