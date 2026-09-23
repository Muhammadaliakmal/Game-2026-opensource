import type { ArcadeGame, GameModule, GameServices } from "@/arcade/host/types";
import { fitView, toView } from "@/arcade/host/view";
import { mulberry32 } from "@/arcade/host/rng";
import { reducedMotion } from "@/lib/motion";
import * as T from "./tuning";
import { FOOT_L, neutralInput } from "./ragdoll";
import { createMatch, scoreFor, type Difficulty, type Match } from "./match";
import { createAi, PROFILES, type Ai } from "./ai";
import {
  KEYS,
  MENU,
  cardAt,
  createKeyReader,
  createTouchControls,
  mergeInput,
  type Choice,
  type TouchControls,
  type ViewTouch,
} from "./controls";
import { RESULT_BUTTONS, createRenderer, type Scene } from "./render";
import { loadSprites } from "./sprites";

/**
 * Ragdoll Rumble — the menu, the match, and the juice, wired to the host.
 *
 * The same shape as every cabinet: numbers in `tuning.ts`, the rules in
 * `ragdoll.ts` / `combat.ts` / `match.ts`, the CPU in `ai.ts`, input in
 * `controls.ts`, drawing in `render.ts`. This file turns events into feel.
 *
 * ── Two ways a run ends ──────────────────────────────────────────────────
 *
 * Against the CPU a match is a run: when it is over the host's own result
 * panel goes up and the payout is settled on `scoreFor`. Two players on one
 * screen is not a run — nobody's wallet should be paid for beating their own
 * sibling, and paying either seat would pay whoever holds the phone — so it
 * never calls `onGameOver`. It puts up its own REMATCH / MENU and loops.
 *
 * ── Juice, and what reduced motion drops ─────────────────────────────────
 *
 * Hit-stop, the directional shake, the KO slow-motion and the spark bursts
 * all move the world, so under `prefers-reduced-motion` they go — the rule in
 * `lib/motion.ts`. The hit star, the sound and the health bar's lag are local
 * to the thing you touched and stay.
 */

/** The last menu card chosen, so a restart lands on it. Survives the run. */
let remembered = 0;

const MENU_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"] as const;
const EDGE_KEYS = [...MENU_KEYS, "Space", "Enter", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyM"] as const;
/** A beat on the final banner before the host's panel covers it. */
const OVER_HOLD = 2.4;

export const create: GameModule["create"] = (s: GameServices): ArcadeGame => {
  const renderer = createRenderer(s.rng);
  let touch: TouchControls = createTouchControls("cpu");
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const scene: Scene = {
    screen: "menu",
    match: null,
    mode: "cpu",
    choice: null,
    selected: remembered,
    pads: touch.pads,
    showTouch: coarse,
    alpha: 1,
    resultT: 0,
  };

  const readers = {
    solo: createKeyReader(KEYS.solo),
    p1: createKeyReader(KEYS.p1),
    p2: createKeyReader(KEYS.p2),
  };
  const in0 = neutralInput();
  const in1 = neutralInput();
  const NEUTRAL = neutralInput();

  let match: Match | null = null;
  let ai: Ai | null = null;
  let difficulty: Difficulty = "easy";
  let hitstop = 0;
  let slowT = 0;
  let overT = 0;
  let ended = false;
  let reported = -1;

  const seen = new Set<number>();
  const was: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};

  function readKeys() {
    for (const k of EDGE_KEYS) {
      const down = s.input.keys[k] === true;
      pressed[k] = down && !was[k];
      was[k] = down;
    }
  }

  function viewTouches(): ViewTouch[] {
    const v = fitView(s.width, s.height, T.VIEW_W, T.VIEW_H);
    return s.input.touches.map((t) => {
      const p = toView(v, t.x, t.y);
      return { id: t.id, x: p.x, y: p.y };
    });
  }

  /** Touches that began this step: taps, for the menus. */
  function taps(list: readonly ViewTouch[]): ViewTouch[] {
    const fresh = list.filter((t) => !seen.has(t.id));
    seen.clear();
    for (const t of list) seen.add(t.id);
    return fresh;
  }

  function start(choice: Choice) {
    scene.choice = choice;
    scene.mode = choice.kind;
    scene.screen = "match";
    scene.resultT = 0;
    touch = createTouchControls(choice.kind);
    scene.pads = touch.pads;
    const seed = Math.floor(s.rng() * 0xffffffff) >>> 0;
    match = createMatch(mulberry32(seed));
    scene.match = match;
    if (choice.kind === "cpu") {
      difficulty = choice.difficulty;
      ai = createAi(PROFILES[choice.difficulty], 1, mulberry32(seed ^ 0x5bd1e995));
    } else {
      ai = null;
    }
    hitstop = 0;
    slowT = 0;
    overT = 0;
    reported = -1;
  }

  function react(m: Match) {
    const calm = reducedMotion();
    for (const e of m.events) {
      switch (e.type) {
        case "round":
          renderer.snap(m);
          s.sfx("perfect", -5);
          break;
        case "fight":
          s.sfx("perfect");
          break;
        case "hit": {
          renderer.effect("star", e.x, e.y, 22 + e.dmg * 1.6);
          s.sfx("place", Math.max(-6, Math.min(12, e.dmg / 2 - 4)));
          if (e.part === "head") s.sfx("coin", 3);
          if (e.heavy) {
            s.sfx("land", -5);
            renderer.effect("ring", e.x, e.y, 60 + e.dmg * 2);
          }
          if (!calm) {
            renderer.burst(e.x, e.y, e.nx, e.ny, Math.min(18, 4 + Math.round(e.dmg / 2)), 160 + e.dmg * 12, e.heavy ? 1 : 0);
            hitstop = Math.max(hitstop, Math.min(T.HITSTOP_MAX, Math.round(e.dmg * T.HITSTOP_PER_DMG)));
            renderer.kick(e.nx, e.ny, Math.min(T.SHAKE_MAX, e.dmg * T.SHAKE_PER_DMG));
          }
          if (e.ko) {
            s.sfx("die");
            renderer.flash(0.5);
            renderer.effect("ring", e.x, e.y, 110);
            if (!calm) slowT = T.KO_SLOW_T;
          }
          break;
        }
        case "clash":
          renderer.effect("star", e.x, e.y, 18);
          s.sfx("coin", 7);
          if (!calm) renderer.burst(e.x, e.y, 0, -1, 8, 220, 2);
          break;
        case "jump": {
          const f = m.fighters[e.fighter];
          renderer.effect("dust", f.x[FOOT_L], f.y[FOOT_L] + 2, 22);
          s.sfx("jump");
          break;
        }
        case "windup":
          s.sfx("close", 5);
          break;
        case "heavy":
          s.sfx("jump", -7);
          break;
        case "tired":
          s.sfx("close", -8);
          break;
        case "lavaTell":
          s.sfx("close", -3);
          break;
        case "lavaRise":
          s.sfx("die", -12);
          break;
        case "burn":
          renderer.effect("splat", e.x, m.lava.y - 6, 48, e.fighter);
          s.sfx("die", -5);
          renderer.flash(0.3);
          if (!calm) renderer.burst(e.x, m.lava.y, 0, -1, 16, 260, 4);
          break;
        case "roundEnd":
          if (e.cause === "time") s.sfx("close");
          break;
        case "matchEnd": {
          const won = scene.mode === "versus" ? e.winner !== null : e.winner === 0;
          s.sfx(won ? "perfect" : "die", won ? 12 : -5);
          break;
        }
      }
    }
  }

  function stepMenu(fresh: readonly ViewTouch[]) {
    for (const t of fresh) {
      const card = cardAt(t.x, t.y);
      if (card) {
        remembered = MENU.indexOf(card);
        return start(card.choice);
      }
    }
    for (let i = 0; i < MENU_KEYS.length; i++) {
      if (pressed[MENU_KEYS[i]]) {
        remembered = i;
        return start(MENU[i].choice);
      }
    }
    if (pressed.ArrowLeft || pressed.KeyA) scene.selected = (scene.selected + MENU.length - 1) % MENU.length;
    if (pressed.ArrowRight || pressed.KeyD) scene.selected = (scene.selected + 1) % MENU.length;
    if (pressed.Space || pressed.Enter) {
      remembered = scene.selected;
      start(MENU[scene.selected].choice);
    }
  }

  function stepMatch(dt: number, list: readonly ViewTouch[]) {
    const m = match;
    if (!m) return;
    if (list.length > 0) scene.showTouch = true;
    if (hitstop > 0) {
      hitstop -= 1;
      return;
    }
    touch.update(list);
    if (scene.mode === "cpu") {
      mergeInput(touch.pads[0], readers.solo.read(s.input.keys), in0);
      const cpu = ai ? ai.input(m) : NEUTRAL;
      Object.assign(in1, cpu);
    } else {
      mergeInput(touch.pads[0], readers.p1.read(s.input.keys), in0);
      mergeInput(touch.pads[1], readers.p2.read(s.input.keys), in1);
    }
    const scale = slowT > 0 ? T.KO_SLOW : 1;
    if (slowT > 0) slowT = Math.max(0, slowT - dt);
    m.step(dt * scale, in0, in1);
    renderer.record(m);
    react(m);

    if (scene.mode === "cpu") {
      const score = scoreFor(m, difficulty);
      if (score !== reported) {
        reported = score;
        s.onScore(score);
      }
    }

    if (m.phase === "over") {
      overT += dt;
      if (overT < OVER_HOLD) return;
      if (scene.mode === "cpu") {
        ended = true;
        s.onGameOver(scoreFor(m, difficulty));
      } else {
        scene.screen = "result";
        scene.resultT = 0;
      }
    }
  }

  function stepResult(dt: number, fresh: readonly ViewTouch[]) {
    scene.resultT += dt;
    // The bodies keep settling behind the buttons.
    if (match) {
      match.step(dt, NEUTRAL, NEUTRAL);
      renderer.record(match);
    }
    if (scene.resultT < 0.6) return;
    let action: "rematch" | "menu" | null = null;
    for (const t of fresh) {
      const b = RESULT_BUTTONS.find((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);
      if (b) action = b.action;
    }
    if (pressed.Space || pressed.Enter) action = "rematch";
    if (pressed.KeyM) action = "menu";
    if (action === "rematch" && scene.choice) start(scene.choice);
    else if (action === "menu") {
      scene.screen = "menu";
      scene.match = null;
      match = null;
    }
  }

  return {
    step(dt) {
      renderer.step(dt, scene, hitstop > 0);
      if (ended) return;
      readKeys();
      const list = viewTouches();
      const fresh = taps(list);
      if (scene.screen === "menu") stepMenu(fresh);
      else if (scene.screen === "match") stepMatch(dt, list);
      else stepResult(dt, fresh);
    },

    render(alpha) {
      // Held still in hit-stop: interpolating towards a step that has not
      // happened would slide the frozen frame.
      scene.alpha = hitstop > 0 ? 1 : alpha;
      renderer.draw(s.ctx, scene, s.width, s.height);
    },

    destroy() {
      renderer.destroy();
    },
  };
};

/**
 * The sheets load before the first step, with a ceiling: a slow network
 * gets the vector fighters rather than a spinner. `loadSprites` never
 * rejects, and a late load still arrives — the renderer asks every frame.
 */
const preload = () =>
  Promise.race([loadSprites().then(() => undefined), new Promise<void>((r) => setTimeout(r, 4000))]);

const mod: GameModule = { create, preload };
export default mod;
