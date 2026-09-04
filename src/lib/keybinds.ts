"use client";

import { create } from "zustand";

/**
 * Every key the game reads, in one place, rebindable and persisted.
 *
 * ── Why a store and not two arrays ───────────────────────────────────────
 *
 * `play/controls.ts` and `race/controls.ts` used to be hard-coded
 * `KeyboardControlsEntry` arrays. That is fine until someone plays on an AZERTY
 * keyboard, or left-hands the arrows, or simply wants boost somewhere their
 * thumb can reach — at which point the answer was "you cannot". Rebinding is
 * not a power-user feature; for a lot of players it is the difference between
 * a game they can play and one they cannot.
 *
 * ── Contexts, and why a key can mean two things ──────────────────────────
 *
 * Bindings are grouped by context: `foot` (walking, jumping, the parkour
 * modes) and `ride` (the bike). The two are never live at the same time, so W
 * meaning "walk forward" in one and "throttle" in the other is not a conflict
 * and must not be reported as one. Conflicts are only ever computed *within* a
 * context.
 *
 * ── Held versus edge ─────────────────────────────────────────────────────
 *
 * A held action ("am I pressing forward right now") is polled every frame and
 * belongs in drei's `KeyboardControls` map. An edge action ("respawn me")
 * fires once per press and cannot: a `KeyboardControls` entry is a boolean you
 * poll, so polling a toggle re-fires it every frame the key is down. The two
 * lists below are the authority on which is which, and `matches()` is how the
 * edge handlers ask whether a `KeyboardEvent.code` belongs to an action.
 *
 * Everything in this file above the store is pure and tested in
 * `keybinds.test.ts` — the resolver is the part a wrong answer from would be
 * invisible until someone's controls silently stopped working.
 */

// ── Actions ──────────────────────────────────────────────────────────────

export const FOOT_ACTIONS = [
  "forward",
  "backward",
  "leftward",
  "rightward",
  "jump",
  "run",
  "respawn",
  "restart",
  "view",
  "recenter",
] as const;

export const RIDE_ACTIONS = [
  "forward",
  "backward",
  "steerLeft",
  "steerRight",
  "brake",
  "boost",
  "drift",
  "lookBack",
  "cameraCycle",
  "respawn",
] as const;

export type FootAction = (typeof FOOT_ACTIONS)[number];
export type RideAction = (typeof RIDE_ACTIONS)[number];
export type Context = "foot" | "ride";
export type Action<C extends Context = Context> = C extends "foot"
  ? FootAction
  : RideAction;

export type Binds = {
  foot: Record<FootAction, string[]>;
  ride: Record<RideAction, string[]>;
};

/** Polled every frame, so these are the ones drei's map carries. */
export const HELD_FOOT: readonly FootAction[] = [
  "forward",
  "backward",
  "leftward",
  "rightward",
  "jump",
  "run",
];

export const HELD_RIDE: readonly RideAction[] = [
  "forward",
  "backward",
  "steerLeft",
  "steerRight",
  "brake",
  "boost",
  "drift",
  "lookBack",
];

/** What each action is called on screen, and the order the settings list them. */
export const FOOT_LABELS: Record<FootAction, string> = {
  forward: "Move forward",
  backward: "Move back",
  leftward: "Move left",
  rightward: "Move right",
  jump: "Jump",
  run: "Sprint / lock on",
  respawn: "Respawn",
  restart: "Restart run",
  view: "First person",
  recenter: "Recentre camera",
};

export const RIDE_LABELS: Record<RideAction, string> = {
  forward: "Throttle",
  backward: "Reverse",
  steerLeft: "Steer left",
  steerRight: "Steer right",
  brake: "Brake",
  boost: "Boost",
  drift: "Drift",
  lookBack: "Look back",
  cameraCycle: "Change camera",
  respawn: "Recover",
};

// ── Defaults and presets ─────────────────────────────────────────────────

/**
 * The default layout, and the one every preset is a variation of.
 *
 * Two keys per movement action — a letter and an arrow — because that is what
 * players expect and because it means the arrow-key preset is a re-slice
 * rather than an addition. Shift is deliberately bound to `run` on foot *and*
 * left as the lock-on toggle: the two have always been the same key and
 * separating them here would change behaviour under cover of a refactor.
 */
export const DEFAULT_BINDS: Binds = {
  foot: {
    forward: ["KeyW", "ArrowUp"],
    backward: ["KeyS", "ArrowDown"],
    leftward: ["KeyA", "ArrowLeft"],
    rightward: ["KeyD", "ArrowRight"],
    jump: ["Space"],
    run: ["ShiftLeft", "ShiftRight"],
    respawn: ["KeyR"],
    // Deliberately not next to R. Respawn costs you a checkpoint's worth of
    // progress; restart costs the whole run, and the two should not be one
    // finger apart on a key you press while falling.
    restart: ["KeyT"],
    view: ["KeyV"],
    recenter: ["KeyC"],
  },
  ride: {
    forward: ["KeyW", "ArrowUp"],
    backward: ["KeyS", "ArrowDown"],
    steerLeft: ["KeyA", "ArrowLeft"],
    steerRight: ["KeyD", "ArrowRight"],
    // Space is the handbrake, which is the same key that jumps on foot — the
    // one control both modes agree means "stop what you are doing".
    brake: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    drift: ["KeyX"],
    lookBack: ["KeyB"],
    cameraCycle: ["KeyV"],
    respawn: ["KeyR"],
  },
};

export type PresetId = "wasd" | "esdf" | "arrows";

/**
 * Whole layouts rather than "swap these two keys".
 *
 * ESDF is the one left-hand-shifted layout worth shipping: it puts the hand
 * one column right, which frees the whole Q/A/Z column for verbs and is what a
 * lot of people who type properly actually want. Arrows is for the right hand,
 * and moves every verb next to the arrow cluster rather than leaving them
 * across the keyboard.
 */
export const PRESETS: Record<PresetId, { name: string; binds: Binds }> = {
  wasd: { name: "WASD", binds: DEFAULT_BINDS },
  esdf: {
    name: "ESDF",
    binds: {
      foot: {
        ...DEFAULT_BINDS.foot,
        forward: ["KeyE", "ArrowUp"],
        backward: ["KeyD", "ArrowDown"],
        leftward: ["KeyS", "ArrowLeft"],
        rightward: ["KeyF", "ArrowRight"],
        respawn: ["KeyR"],
        view: ["KeyV"],
        recenter: ["KeyC"],
      },
      ride: {
        ...DEFAULT_BINDS.ride,
        forward: ["KeyE", "ArrowUp"],
        backward: ["KeyD", "ArrowDown"],
        steerLeft: ["KeyS", "ArrowLeft"],
        steerRight: ["KeyF", "ArrowRight"],
        drift: ["KeyQ"],
        lookBack: ["KeyA"],
        cameraCycle: ["KeyV"],
      },
    },
  },
  arrows: {
    name: "Arrows",
    binds: {
      foot: {
        forward: ["ArrowUp"],
        backward: ["ArrowDown"],
        leftward: ["ArrowLeft"],
        rightward: ["ArrowRight"],
        jump: ["Space"],
        run: ["ShiftRight", "ShiftLeft"],
        // Next to the arrows rather than across the keyboard: a right-handed
        // layout whose verbs are still on the left hand is only half a layout.
        respawn: ["Delete"],
        // The far corner of the six-key cluster, for the same reason T is not
        // next to R: restarting is the expensive one.
        restart: ["PageUp"],
        view: ["End"],
        recenter: ["PageDown"],
      },
      ride: {
        forward: ["ArrowUp"],
        backward: ["ArrowDown"],
        steerLeft: ["ArrowLeft"],
        steerRight: ["ArrowRight"],
        brake: ["Space"],
        boost: ["ShiftRight", "ShiftLeft"],
        drift: ["ControlRight", "ControlLeft"],
        lookBack: ["End"],
        cameraCycle: ["PageDown"],
        respawn: ["Delete"],
      },
    },
  },
};

// ── Pure resolver ────────────────────────────────────────────────────────

/** Most keys a single action may carry. Beyond this a conflict list is noise. */
export const MAX_KEYS_PER_ACTION = 3;

const uniq = (codes: string[]) => [...new Set(codes)];

/**
 * Coerce anything at all into a complete, valid `Binds`.
 *
 * Storage is the untrusted input here: it holds whatever the last version of
 * the app wrote, possibly years ago, possibly hand-edited. Actions added since
 * fall back to their default, actions removed since are dropped, and a garbage
 * value for one action cannot take the rest of the layout down with it.
 */
export function normalizeBinds(input: unknown): Binds {
  const src = (input ?? {}) as Partial<Record<Context, unknown>>;
  const out = { foot: {}, ride: {} } as Binds;

  const fill = <A extends string>(
    ctx: Context,
    actions: readonly A[],
    fallback: Record<A, string[]>
  ) => {
    const stored = (src[ctx] ?? {}) as Record<string, unknown>;
    const target = out[ctx] as unknown as Record<string, string[]>;
    for (const action of actions) {
      const raw = stored[action];
      const codes = Array.isArray(raw)
        ? uniq(
            raw.filter(
              (c): c is string => typeof c === "string" && c.length > 0
            )
          ).slice(0, MAX_KEYS_PER_ACTION)
        : [];
      // An empty array is a legitimate choice — "I never want this bound" —
      // but only if it was stored as one. A missing key means a new action.
      target[action] = Array.isArray(raw) ? codes : [...fallback[action]];
    }
  };

  fill("foot", FOOT_ACTIONS, DEFAULT_BINDS.foot);
  fill("ride", RIDE_ACTIONS, DEFAULT_BINDS.ride);
  return out;
}

/** Does this `KeyboardEvent.code` trigger that action? */
export function matches(
  binds: Binds,
  ctx: Context,
  action: string,
  code: string
): boolean {
  const map = binds[ctx] as unknown as Record<string, string[] | undefined>;
  return map[action]?.includes(code) ?? false;
}

export interface Conflict {
  context: Context;
  code: string;
  actions: string[];
}

/**
 * Every key bound to more than one action in the same context.
 *
 * Reported rather than prevented. A player who deliberately puts brake and
 * drift on the same key has a reason; the interface's job is to make sure they
 * did it on purpose, not to refuse. Sorted so the list does not reshuffle
 * itself between renders.
 */
export function findConflicts(binds: Binds): Conflict[] {
  const out: Conflict[] = [];
  for (const ctx of ["foot", "ride"] as const) {
    const byCode = new Map<string, string[]>();
    const map = binds[ctx] as unknown as Record<string, string[]>;
    for (const action of Object.keys(map)) {
      for (const code of map[action]) {
        const list = byCode.get(code) ?? [];
        list.push(action);
        byCode.set(code, list);
      }
    }
    for (const [code, actions] of byCode) {
      if (actions.length > 1) out.push({ context: ctx, code, actions });
    }
  }
  return out.sort((a, b) =>
    a.context === b.context
      ? a.code.localeCompare(b.code)
      : a.context.localeCompare(b.context)
  );
}

/** Replace one action's keys. Returns a new object; never mutates. */
export function setBinding(
  binds: Binds,
  ctx: Context,
  action: string,
  codes: string[]
): Binds {
  const next = {
    foot: { ...binds.foot },
    ride: { ...binds.ride },
  } as unknown as Record<Context, Record<string, string[]>>;
  next[ctx][action] = uniq(codes).slice(0, MAX_KEYS_PER_ACTION);
  return next as unknown as Binds;
}

/** Which preset this layout *is*, or null if it has been edited. */
export function presetOf(binds: Binds): PresetId | null {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    if (JSON.stringify(normalizeBinds(PRESETS[id].binds)) === JSON.stringify(binds)) {
      return id;
    }
  }
  return null;
}

/**
 * A `KeyboardEvent.code` as a person would write it.
 *
 * Codes are physical positions, not characters — `KeyA` is the key where A
 * sits on a US layout and is Q on AZERTY — so this is an approximation by
 * definition. It is still far better than showing "ArrowUp" on a settings row,
 * and the alternative (`event.key`) changes with the shift state and the OS
 * language, which is worse in a different direction.
 */
export function keyLabel(code: string): string {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Space: "Space",
    ShiftLeft: "Shift L",
    ShiftRight: "Shift R",
    ControlLeft: "Ctrl L",
    ControlRight: "Ctrl R",
    AltLeft: "Alt L",
    AltRight: "Alt R",
    Enter: "Enter",
    Escape: "Esc",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Del",
    Insert: "Ins",
    Home: "Home",
    End: "End",
    PageUp: "Pg Up",
    PageDown: "Pg Dn",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };
  return named[code] ?? code;
}

/**
 * Keys we refuse to capture while listening for a new binding.
 *
 * Escape cancels the capture, and the browser owns the rest — binding F5 or
 * Ctrl to a game action produces a control that works until the day the player
 * presses it in a context where the browser wins, which is worse than not
 * offering it.
 */
export const UNBINDABLE = new Set([
  "Escape",
  "F1",
  "F3",
  "F5",
  "F6",
  "F11",
  "F12",
  "MetaLeft",
  "MetaRight",
  "ContextMenu",
]);

// ── Store ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "blockworld:keybinds:v1";

function load(): Binds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeBinds(raw ? JSON.parse(raw) : null);
  } catch {
    // Storage throws outright in some privacy modes, and a corrupt blob is
    // exactly as likely as a missing one. Defaults are always playable.
    return normalizeBinds(null);
  }
}

function save(binds: Binds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
  } catch {
    /* the layout still applies for this session */
  }
}

interface KeybindState {
  binds: Binds;
  /** Bumped on every change, so `KeyboardControls` can be re-keyed on it. */
  revision: number;
  setBinding(ctx: Context, action: string, codes: string[]): void;
  applyPreset(id: PresetId): void;
  reset(): void;
}

export const useKeybinds = create<KeybindState>((set, get) => ({
  // Read at creation rather than in an effect: every consumer is inside an
  // `ssr:false` dynamic import, so there is no server render to mismatch, and
  // a setState-in-effect here would flash the default layout first.
  binds: typeof window === "undefined" ? normalizeBinds(null) : load(),
  revision: 0,

  setBinding: (ctx, action, codes) => {
    const next = setBinding(get().binds, ctx, action, codes);
    save(next);
    set((s) => ({ binds: next, revision: s.revision + 1 }));
  },

  applyPreset: (id) => {
    const next = normalizeBinds(PRESETS[id].binds);
    save(next);
    set((s) => ({ binds: next, revision: s.revision + 1 }));
  },

  reset: () => {
    const next = normalizeBinds(DEFAULT_BINDS);
    save(next);
    set((s) => ({ binds: next, revision: s.revision + 1 }));
  },
}));

/**
 * Read the current bindings outside React.
 *
 * The frame loops and the window key handlers are not components, and none of
 * them should re-render anything when a binding changes.
 */
export const currentBinds = () => useKeybinds.getState().binds;

/** `matches` against the live bindings — the form every key handler wants. */
export const bound = (ctx: Context, action: string, code: string) =>
  matches(currentBinds(), ctx, action, code);
