import type { InputState, TouchPoint } from "./types";

/**
 * Keyboard and touch, collected into one map the games read once per step.
 *
 * ── Never put gameplay in a listener ─────────────────────────────────────
 *
 * A keydown handler that makes the player jump runs at the browser's key
 * repeat rate, not the simulation's, so the same press does different things
 * on different machines — and it fires while the loop is between steps, which
 * is the one moment the state is not consistent. Listeners write booleans;
 * `step` reads them. That rule is the whole design of this file.
 *
 * ── Edges, not just levels ───────────────────────────────────────────────
 *
 * "Is jump held" and "was jump pressed this step" are different questions and
 * both are needed — a runner wants the edge, a shooter wants the level. The
 * host calls `endStep()` after each step so `pressed()` answers for exactly
 * one step per physical press, whatever the frame rate.
 *
 * ── A level lasts at least one step ──────────────────────────────────────
 *
 * `pressed()` is not part of what a game is handed (see `InputState`), so
 * every cabinet derives its own edge from the level: `down && !was`. That
 * misses a tap that begins and ends between two steps — which a real thumb
 * does whenever the frame before it hitched. So a release that arrives
 * before any step has seen the press is held back until the end of the next
 * step. The game sees one step of "down", exactly as it would have on a
 * smooth frame, and the release lands right after.
 */

/** Keys that would scroll, zoom or otherwise fight the game if left alone. */
const SWALLOW = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
]);

const AXIS_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export interface InputHost {
  readonly state: InputState;
  /** True on the first step after a press. */
  pressed(code: string): boolean;
  /** Call after each sim step, so an edge lasts exactly one step. */
  endStep(): void;
  /** Forget everything held. Used on pause and on restart. */
  clear(): void;
  detach(): void;
}

export function attachInput(target: HTMLCanvasElement): InputHost {
  const keys: Record<string, boolean> = {};
  const edges: Record<string, boolean> = {};
  /** Releases that arrived before a step saw the press; applied in `endStep`. */
  const pendingUp: Record<string, boolean> = {};
  let pointerUpPending = false;
  const pointer = { x: 0, y: 0, down: false };
  const axis = { x: 0, y: 0 };
  /**
   * Every pointer that is down. Mutated in place, so a game holding the array
   * reads the live list — `state.touches` is the same object for the run.
   */
  const touches: TouchPoint[] = [];
  /** Ids pressed since the last step, and ids whose release waits on one. */
  const freshTouch = new Set<number>();
  const pendingTouchUp = new Set<number>();
  const state: InputState = { keys, pointer, axis, touches };

  const touchAt = (id: number) => touches.findIndex((t) => t.id === id);
  const dropTouch = (id: number) => {
    const i = touchAt(id);
    if (i >= 0) touches.splice(i, 1);
  };

  const recomputeAxis = () => {
    let x = 0;
    let y = 0;
    for (const code in AXIS_KEYS) {
      if (!keys[code]) continue;
      x += AXIS_KEYS[code][0];
      y += AXIS_KEYS[code][1];
    }
    // Clamped rather than normalised: holding W and D should be full speed
    // diagonally, and a game that wants a unit vector can normalise it itself.
    axis.x = x < -1 ? -1 : x > 1 ? 1 : x;
    axis.y = y < -1 ? -1 : y > 1 ? 1 : y;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (SWALLOW.has(e.code)) e.preventDefault();
    // `repeat` is the OS key-repeat, which is not a new press and must not
    // become one — otherwise holding a key machine-guns whatever it triggers.
    if (e.repeat) return;
    if (!keys[e.code]) edges[e.code] = true;
    keys[e.code] = true;
    // A second press before the deferred release landed is still held.
    pendingUp[e.code] = false;
    recomputeAxis();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    // The edge is still set only if no step has run since the press.
    if (edges[e.code]) {
      pendingUp[e.code] = true;
      return;
    }
    keys[e.code] = false;
    recomputeAxis();
  };

  /** A blurred window never sends the keyup, so the key would stay held. */
  const onBlur = () => clear();

  const movePointer = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  };

  const placeTouch = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    const i = touchAt(e.pointerId);
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (i >= 0) {
      touches[i].x = x;
      touches[i].y = y;
    }
    return { x, y };
  };

  const onPointerDown = (e: PointerEvent) => {
    movePointer(e);
    if (touchAt(e.pointerId) < 0) {
      const { x, y } = placeTouch(e);
      touches.push({ id: e.pointerId, x, y });
    }
    freshTouch.add(e.pointerId);
    pendingTouchUp.delete(e.pointerId);
    if (!pointer.down) edges.Pointer = true;
    pointer.down = true;
    pointerUpPending = false;
    // So a finger that slides off the canvas still delivers its release.
    target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    movePointer(e);
    placeTouch(e);
  };
  const onPointerUp = (e: PointerEvent) => {
    movePointer(e);
    placeTouch(e);
    target.releasePointerCapture?.(e.pointerId);
    // The same rule as `pointer`: a touch no step has seen stays one step.
    if (freshTouch.has(e.pointerId)) pendingTouchUp.add(e.pointerId);
    else dropTouch(e.pointerId);
    if (edges.Pointer) {
      pointerUpPending = true;
      return;
    }
    pointer.down = false;
  };

  function clear() {
    for (const k in keys) keys[k] = false;
    for (const k in edges) edges[k] = false;
    for (const k in pendingUp) pendingUp[k] = false;
    pointerUpPending = false;
    pointer.down = false;
    axis.x = 0;
    axis.y = 0;
    touches.length = 0;
    freshTouch.clear();
    pendingTouchUp.clear();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);

  return {
    state,
    pressed: (code) => edges[code] === true,
    endStep() {
      for (const k in edges) edges[k] = false;
      let axisDirty = false;
      for (const k in pendingUp) {
        if (!pendingUp[k]) continue;
        pendingUp[k] = false;
        keys[k] = false;
        axisDirty = true;
      }
      if (axisDirty) recomputeAxis();
      if (pointerUpPending) {
        pointerUpPending = false;
        pointer.down = false;
      }
      freshTouch.clear();
      for (const id of pendingTouchUp) dropTouch(id);
      pendingTouchUp.clear();
    },
    clear,
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

/** The one press every game treats as "go": space, tap, or the gamepad-ish W. */
export const ACTION_KEYS = ["Space", "KeyW", "ArrowUp", "Enter"] as const;

/** True on the step a jump/drop/act was newly requested, keyboard or touch. */
export function actionPressed(input: InputHost): boolean {
  if (input.pressed("Pointer")) return true;
  for (const code of ACTION_KEYS) if (input.pressed(code)) return true;
  return false;
}
