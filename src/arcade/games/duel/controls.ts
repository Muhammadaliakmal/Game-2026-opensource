import * as T from "./tuning";
import type { FighterInput } from "./ragdoll";

/**
 * Thumbs and keys, turned into two `FighterInput`s.
 *
 * ── Two sticks on one glass ──────────────────────────────────────────────
 *
 * Versus mode gives each player half the screen. A finger that lands in a
 * half belongs to that half's player until it lifts, wherever it wanders —
 * so P1 dragging across the middle does not hand the stick to P2. Each
 * finger is tracked by `pointerId` (see `InputState.touches`), which is the
 * only thing that tells two thumbs apart.
 *
 * ── The stick is where you put it ────────────────────────────────────────
 *
 * Dynamic: it appears under the thumb, and when the thumb drags past the
 * rim the centre follows it. Following is what makes a reversal immediate —
 * a fixed centre makes you drag back across the whole radius before the arm
 * starts to turn, and in a game where turning the arm fast IS the attack,
 * that is the difference between a swing and a wave.
 *
 * ── Small push aims, full push walks ─────────────────────────────────────
 *
 * The stick is both: its direction is where the weapon points and its
 * sideways part past WALK_DEAD is a walk. A part push swings without
 * stepping in. That rule is in `ragdoll.ts`; this file only reports the
 * stick honestly.
 */

export type ModeKind = "cpu" | "versus";

export interface Button {
  readonly player: 0 | 1;
  readonly kind: "jump" | "heavy";
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Where the buttons are, in view px.
 *
 * Alone, both sit in the bottom-right under the right thumb, heavy nearer
 * the corner because it is the one held. In versus, each player's pair sits
 * at the inner bottom of their own half, so the outer part of each half is
 * clear for the stick thumb.
 */
export function buttonsFor(mode: ModeKind): readonly Button[] {
  const r = T.BUTTON_R;
  const low = T.VIEW_H - r - 18;
  if (mode === "cpu") {
    return [
      { player: 0, kind: "heavy", x: T.VIEW_W - r - 24, y: low - 20, r },
      { player: 0, kind: "jump", x: T.VIEW_W - r * 3 - 44, y: low, r },
    ];
  }
  const mid = T.VIEW_W / 2;
  return [
    { player: 0, kind: "heavy", x: mid - r - 22, y: low - 20, r },
    { player: 0, kind: "jump", x: mid - r * 3 - 40, y: low, r },
    { player: 1, kind: "heavy", x: mid + r + 22, y: low - 20, r },
    { player: 1, kind: "jump", x: mid + r * 3 + 40, y: low, r },
  ];
}

export interface Pad {
  /** The stick, -1..1, y down. Zero with no thumb on it. */
  x: number;
  y: number;
  jump: boolean;
  heavy: boolean;
  /** For drawing: whether a thumb is on the stick, its centre, and the knob. */
  active: boolean;
  ox: number;
  oy: number;
  kx: number;
  ky: number;
  /** Buttons held this step, for lighting them. */
  held: { jump: boolean; heavy: boolean };
}

const newPad = (): Pad => ({
  x: 0, y: 0, jump: false, heavy: false, active: false,
  ox: 0, oy: 0, kx: 0, ky: 0, held: { jump: false, heavy: false },
});

type Owner = { player: 0 | 1; role: "stick" } | { player: 0 | 1; role: "jump" | "heavy" };

export interface ViewTouch {
  id: number;
  x: number;
  y: number;
}

export interface TouchControls {
  readonly pads: readonly [Pad, Pad];
  /** Feed every touch that is down this step, in view px. */
  update(touches: readonly ViewTouch[]): void;
  reset(): void;
}

export function createTouchControls(mode: ModeKind): TouchControls {
  const buttons = buttonsFor(mode);
  const pads: [Pad, Pad] = [newPad(), newPad()];
  const owners = new Map<number, Owner>();
  const wasJump = [false, false];

  const playerAt = (x: number): 0 | 1 => (mode === "versus" && x >= T.VIEW_W / 2 ? 1 : 0);

  function claim(t: ViewTouch): Owner | null {
    for (const b of buttons) {
      if (Math.hypot(t.x - b.x, t.y - b.y) <= b.r + 10) return { player: b.player, role: b.kind };
    }
    const player = playerAt(t.x);
    // One stick per player: a second finger in the same half does nothing.
    for (const o of owners.values()) if (o.player === player && o.role === "stick") return null;
    const pad = pads[player];
    pad.active = true;
    pad.ox = pad.kx = t.x;
    pad.oy = pad.ky = t.y;
    return { player, role: "stick" };
  }

  return {
    pads,
    update(touches) {
      const live = new Set<number>();
      for (const t of touches) live.add(t.id);
      // Lifted fingers let go of what they held.
      for (const [id, o] of owners) {
        if (live.has(id)) continue;
        owners.delete(id);
        if (o.role === "stick") {
          const p = pads[o.player];
          p.active = false;
          p.x = p.y = 0;
        }
      }
      for (const p of pads) {
        p.held.jump = false;
        p.held.heavy = false;
      }
      for (const t of touches) {
        let o = owners.get(t.id);
        if (!o) {
          const claimed = claim(t);
          if (!claimed) continue;
          owners.set(t.id, claimed);
          o = claimed;
        }
        const p = pads[o.player];
        if (o.role === "stick") {
          let dx = t.x - p.ox;
          let dy = t.y - p.oy;
          const d = Math.hypot(dx, dy);
          if (d > T.STICK_R) {
            // The centre follows the thumb out, so turning back is instant.
            p.ox = t.x - (dx / d) * T.STICK_R;
            p.oy = t.y - (dy / d) * T.STICK_R;
            dx = t.x - p.ox;
            dy = t.y - p.oy;
          }
          p.kx = t.x;
          p.ky = t.y;
          p.x = dx / T.STICK_R;
          p.y = dy / T.STICK_R;
        } else {
          p.held[o.role] = true;
        }
      }
      for (const i of [0, 1] as const) {
        const p = pads[i];
        p.heavy = p.held.heavy;
        p.jump = p.held.jump && !wasJump[i];
        wasJump[i] = p.held.jump;
      }
    },
    reset() {
      owners.clear();
      for (const p of pads) Object.assign(p, newPad());
      wasJump[0] = wasJump[1] = false;
    },
  };
}

// ── Keys ───────────────────────────────────────────────────────────────────

interface KeySet {
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  jump: readonly string[];
  heavy: readonly string[];
}

/** Alone, either hand's cluster works; in versus they split. */
export const KEYS: Record<"solo" | "p1" | "p2", KeySet> = {
  solo: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["Space", "Enter"],
    heavy: ["KeyF", "ShiftLeft", "ShiftRight", "KeyJ"],
  },
  p1: {
    up: ["KeyW"],
    down: ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    jump: ["Space"],
    heavy: ["KeyF", "ShiftLeft"],
  },
  p2: {
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    jump: ["Enter", "Period", "NumpadEnter"],
    heavy: ["ShiftRight", "Slash", "Numpad0"],
  },
};

const any = (keys: Readonly<Record<string, boolean>>, codes: readonly string[]) =>
  codes.some((c) => keys[c] === true);

export interface KeyReader {
  /** Keys for one player this step. `jump` is an edge. */
  read(keys: Readonly<Record<string, boolean>>): { x: number; y: number; jump: boolean; heavy: boolean };
}

export function createKeyReader(set: KeySet): KeyReader {
  let was = false;
  return {
    read(keys) {
      const x = (any(keys, set.right) ? 1 : 0) - (any(keys, set.left) ? 1 : 0);
      const y = (any(keys, set.down) ? 1 : 0) - (any(keys, set.up) ? 1 : 0);
      const j = any(keys, set.jump);
      const jump = j && !was;
      was = j;
      return { x, y, jump, heavy: any(keys, set.heavy) };
    },
  };
}

/**
 * Touch and keys for one player, into `out`. A thumb on the stick wins over
 * the keys for direction; buttons and keys add.
 */
export function mergeInput(
  pad: Pad,
  keys: { x: number; y: number; jump: boolean; heavy: boolean },
  out: FighterInput
): FighterInput {
  if (pad.active) {
    out.x = pad.x;
    out.y = pad.y;
  } else {
    out.x = keys.x;
    out.y = keys.y;
  }
  out.jump = pad.jump || keys.jump;
  out.heavy = pad.heavy || keys.heavy;
  return out;
}

// ── The menu ───────────────────────────────────────────────────────────────

export type Choice =
  | { kind: "cpu"; difficulty: "easy" | "medium" | "hard" }
  | { kind: "versus" };

export interface MenuCard {
  readonly choice: Choice;
  readonly label: string;
  readonly sub: string;
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const CARD_W = 184;
const CARD_H = 124;
const CARD_GAP = 18;
const CARDS_X = (T.VIEW_W - (CARD_W * 4 + CARD_GAP * 3)) / 2;

export const MENU: readonly MenuCard[] = (
  [
    [{ kind: "cpu", difficulty: "easy" }, "EASY", "vs CPU", "Digit1"],
    [{ kind: "cpu", difficulty: "medium" }, "MEDIUM", "vs CPU", "Digit2"],
    [{ kind: "cpu", difficulty: "hard" }, "HARD", "vs CPU", "Digit3"],
    [{ kind: "versus" }, "2 PLAYERS", "one screen", "Digit4"],
  ] as const
).map(([choice, label, sub, key], i) => ({
  choice,
  label,
  sub,
  key,
  x: CARDS_X + i * (CARD_W + CARD_GAP),
  y: 232,
  w: CARD_W,
  h: CARD_H,
}));

/** The card under a point, if any. */
export function cardAt(x: number, y: number): MenuCard | undefined {
  return MENU.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
}
