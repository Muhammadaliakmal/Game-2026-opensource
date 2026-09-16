import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { fitView, toView } from "@/arcade/host/view";
import { createSim, type SimInput } from "./sim";
import { createRenderer } from "./render";
import * as T from "./tuning";

/**
 * SwarmRush — the game, wired to the host.
 *
 * ── Where you point is where you go ──────────────────────────────────────
 *
 * The pointer's offset from the centre of the screen is the steering: its
 * direction is the heading and its length, past a dead zone, is the speed.
 * A mouse hovers, a thumb drags, and it is the same rule for both — which
 * is what the doc's "one input axis" comes to on a screen. WASD and the
 * arrows steer too, and win when held.
 *
 * ── A tap is a dash ──────────────────────────────────────────────────────
 *
 * A press that lifts inside `TAP_STEPS` without moving is a dash — a click
 * on a mouse, a tap on a phone. Space dashes on a keyboard. Split is `E`
 * or Shift, or the button drawn in the bottom-right corner; a press that
 * begins on the button is the button's, not the steering's.
 *
 * ── Feel ─────────────────────────────────────────────────────────────────
 *
 * The doc's table, in order: a pip that climbs with a feeding streak, a
 * burst and a squash on a kill, a heartbeat vignette when something bigger
 * is close, a flash and a shake on a death, and the Big Mode announcement
 * with a shake of its own.
 */

const DASH_KEYS = ["Space"] as const;
const SPLIT_KEYS = ["KeyE", "ShiftLeft", "ShiftRight"] as const;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const sim = createSim(s.rng);
  const renderer = createRenderer(s.rng);

  const input: SimInput = { dx: 0, dy: 0, dash: false, split: false };

  let wasDown = false;
  let downSteps = 0;
  let downX = 0;
  let downY = 0;
  let onButton = false;
  let pointerSeen = false;
  let wasDashKey = false;
  let wasSplitKey = false;

  let shake = 0;
  let threat = 0;
  let streak = 0;
  let streakCool = 0;
  let ended = false;

  const anyKey = (codes: readonly string[]) => {
    for (const c of codes) if (s.input.keys[c] === true) return true;
    return false;
  };

  const inSplitButton = (vx: number, vy: number) => {
    const size = T.SPLIT_BTN.size;
    const x = T.VIEW_W - T.SPLIT_BTN.margin - size;
    const y = T.VIEW_H - T.SPLIT_BTN.margin - size;
    return vx >= x - 6 && vx <= x + size + 6 && vy >= y - 6 && vy <= y + size + 6;
  };

  const readInput = () => {
    input.dash = false;
    input.split = false;

    // Keys.
    const dashKey = anyKey(DASH_KEYS);
    if (dashKey && !wasDashKey) input.dash = true;
    wasDashKey = dashKey;
    const splitKey = anyKey(SPLIT_KEYS);
    if (splitKey && !wasSplitKey) input.split = true;
    wasSplitKey = splitKey;

    // Pointer.
    const p = s.input.pointer;
    if (!pointerSeen && (p.x !== 0 || p.y !== 0 || p.down)) pointerSeen = true;
    const view = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
    const v = toView(view, p.x, p.y);

    if (p.down && !wasDown) {
      downSteps = 0;
      downX = v.x;
      downY = v.y;
      onButton = inSplitButton(v.x, v.y);
      if (onButton) input.split = true;
    }
    if (p.down) downSteps++;
    if (!p.down && wasDown && !onButton) {
      const moved = Math.hypot(v.x - downX, v.y - downY);
      if (downSteps <= T.TAP_STEPS && moved < T.TAP_MOVE_PX) input.dash = true;
    }
    wasDown = p.down;

    // Steering: keys first, then the pointer's offset from the centre.
    const ax = s.input.axis.x;
    const ay = s.input.axis.y;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay) || 1;
      input.dx = ax / len;
      input.dy = ay / len;
    } else if (pointerSeen && !(p.down && onButton)) {
      const ox = v.x - T.VIEW_W / 2;
      const oy = v.y - T.VIEW_H / 2;
      const d = Math.hypot(ox, oy);
      if (d < T.STEER_DEAD_PX) {
        input.dx = input.dy = 0;
      } else {
        const k = Math.min(1, (d - T.STEER_DEAD_PX) / (T.STEER_FULL_PX - T.STEER_DEAD_PX));
        input.dx = (ox / d) * k;
        input.dy = (oy / d) * k;
      }
    } else {
      input.dx = input.dy = 0;
    }
  };

  return {
    step(dt) {
      renderer.step(dt);
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_PX / T.SHAKE_DECAY) * dt);
      if (streakCool > 0) streakCool -= dt;
      else streak = 0;
      if (ended) return;

      readInput();
      sim.step(dt, input);
      const e = sim.events;

      if (e.ate > 0) {
        // The pip climbs with a feeding streak, then falls back if you stop.
        streak = Math.min(12, streak + e.ate);
        streakCool = 0.9;
        s.sfx("coin", streak - 6);
        const c = sim.centre();
        renderer.burst(c.x, c.y, "#ffd166", Math.min(4, e.ate), 90);
      }
      if (e.dashed) s.sfx("jump", -2);
      if (e.split) {
        s.sfx("place", 4);
        const c = sim.centre();
        renderer.burst(c.x, c.y, "#6ff5ff", 8, 200);
      }
      if (e.merged) s.sfx("place", 9);
      if (e.hazard) s.sfx("close", -6);
      if (e.killed) {
        s.sfx("perfect", Math.min(12, sim.kills * 2));
        renderer.burst(e.killed.x, e.killed.y, `hsl(${e.killed.hue} 70% 60%)`, 22, 260);
        renderer.flash(0.35);
        shake = T.SHAKE_PX * 0.6;
      }
      if (e.died) {
        s.sfx("die");
        renderer.flash(0.6);
        shake = T.SHAKE_PX;
      }
      if (e.bigStart) {
        s.sfx("perfect", -7);
        s.sfx("die", 12);
        renderer.flash(0.5);
        shake = T.SHAKE_PX * 0.8;
      }
      if (e.won) s.sfx("perfect", 12);
      if (e.lost) s.sfx("die", -5);

      // The heartbeat: eased so a bot skimming past does not strobe it.
      threat += (e.threat - threat) * Math.min(1, 8 * dt);
      if (e.threat > 0.7 && threat < 0.72) s.sfx("close");

      s.onScore(sim.score);
      if (sim.phase === "done") {
        ended = true;
        s.onGameOver(sim.score);
      }
    },

    render(alpha) {
      renderer.draw(s.ctx, sim, ended || sim.deathSteps > 0 ? 0 : alpha, shake, threat, s.width, s.height);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

const module_: GameModule = { create };
export default module_;
