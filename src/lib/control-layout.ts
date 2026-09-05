"use client";

import { create } from "zustand";

/**
 * Where each touch control sits, and how big it is.
 *
 * ── The model: a delta, not a position ───────────────────────────────────
 *
 * Every control keeps the place the designed layout puts it — left thumb
 * steers, right thumb acts, 8px apart, clear of the notch — and the player's
 * customisation is an OFFSET from that anchor plus a size multiplier. Storing
 * absolute coordinates instead would have been simpler to drag and wrong the
 * first time somebody rotated their phone or opened the game on a tablet: a
 * button pinned to (980, 610) on the device it was placed on is off-screen on
 * a smaller one, and there is no honest way to migrate it. A delta degrades
 * gracefully — the anchor moves with the layout and the nudge comes along.
 *
 * It also means the defaults keep working. A player who never opens the editor
 * has every offset at (0, 0) and scale 1, which composes to exactly the layout
 * that shipped, so this file cannot regress anyone who does not use it.
 *
 * ── Why offsets are clamped and scale is bounded ─────────────────────────
 *
 * A control dragged off the edge of the screen is a control that cannot be
 * pressed, and the player who did it has no way back except this file's reset.
 * `LIMIT` keeps everything within a screen's worth of travel of its anchor;
 * the editor additionally refuses to let a button leave the viewport.
 *
 * `MIN_SCALE` is not a taste call. TouchButton's small size is 48px because
 * Apple HIG asks 44×44pt, Material 48×48dp and WCAG 2.5.5 AAA 44×44 CSS px —
 * so 0.75 on the 64px medium button is 48, and the floor holds. Going below it
 * would let the interface offer a control that fails the same audit the rest
 * of the app passes.
 */

/** Every control a player is allowed to move. */
export type ControlId =
  // On foot
  | "stick"
  | "jump"
  | "run"
  | "fly"
  | "retry"
  // Riding
  | "go"
  | "brake"
  | "drift"
  | "boost"
  | "look"
  | "back"
  | "steer-left"
  | "steer-right";

export interface ControlPlacement {
  /** Horizontal nudge from the anchor, CSS px. Positive is right. */
  dx: number;
  /** Vertical nudge from the anchor, CSS px. Positive is down. */
  dy: number;
  /** Size multiplier on the control's designed size. */
  scale: number;
}

export const DEFAULT_PLACEMENT: ControlPlacement = { dx: 0, dy: 0, scale: 1 };

/** Furthest a control may be nudged from its anchor, CSS px, per axis. */
const LIMIT = 400;
/** See the header — 0.75 keeps the 64px control on the 48px touch floor. */
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 1.75;

/** Human names, for the editor's list and for a reset confirmation. */
export const CONTROL_NAMES: Record<ControlId, string> = {
  stick: "Stick",
  jump: "Jump",
  run: "Run",
  fly: "Fly",
  retry: "Retry",
  go: "Go",
  brake: "Brake",
  drift: "Drift",
  boost: "Boost",
  look: "Look",
  back: "Reverse",
  "steer-left": "Steer left",
  "steer-right": "Steer right",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** The one place a stored placement is allowed to be wrong. */
function sanitise(raw: unknown): ControlPlacement {
  const p = raw as Partial<ControlPlacement> | null | undefined;
  const dx = Number(p?.dx);
  const dy = Number(p?.dy);
  const scale = Number(p?.scale);
  return {
    dx: Number.isFinite(dx) ? clamp(Math.round(dx), -LIMIT, LIMIT) : 0,
    dy: Number.isFinite(dy) ? clamp(Math.round(dy), -LIMIT, LIMIT) : 0,
    scale: Number.isFinite(scale) ? clamp(scale, MIN_SCALE, MAX_SCALE) : 1,
  };
}

type Layout = Partial<Record<ControlId, ControlPlacement>>;

interface ControlLayout {
  layout: Layout;
  /** Placement for one control, defaults included. Never returns undefined. */
  placementOf(id: ControlId): ControlPlacement;
  /** Move a control by a delta, in screen pixels. */
  nudge(id: ControlId, dx: number, dy: number): void;
  /** Set the absolute offset — used when a drag ends. */
  place(id: ControlId, dx: number, dy: number): void;
  setScale(id: ControlId, scale: number): void;
  /** Put one control back where it was designed to be. */
  clear(id: ControlId): void;
  /** Put every control back. */
  reset(): void;
  /** Whether anything has been customised — drives the Reset button's state. */
  customised(): boolean;
}

const STORAGE_KEY = "blockworld:controls:v1";

function load(): Layout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Layout = {};
    for (const id of Object.keys(CONTROL_NAMES) as ControlId[]) {
      if (parsed[id]) out[id] = sanitise(parsed[id]);
    }
    return out;
  } catch {
    // A private window, blocked site data, or a value from a future version.
    return {};
  }
}

function save(layout: Layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* the arrangement still applies for this session */
  }
}

export const useControlLayout = create<ControlLayout>((set, get) => {
  const write = (layout: Layout) => {
    set({ layout });
    save(layout);
  };

  return {
    // Read at creation. Every consumer is inside an `ssr:false` dynamic import,
    // so there is no server render for this to mismatch.
    layout: typeof window === "undefined" ? {} : load(),

    placementOf: (id) => get().layout[id] ?? DEFAULT_PLACEMENT,

    nudge: (id, dx, dy) => {
      const cur = get().layout[id] ?? DEFAULT_PLACEMENT;
      write({
        ...get().layout,
        [id]: sanitise({ ...cur, dx: cur.dx + dx, dy: cur.dy + dy }),
      });
    },

    place: (id, dx, dy) => {
      const cur = get().layout[id] ?? DEFAULT_PLACEMENT;
      write({ ...get().layout, [id]: sanitise({ ...cur, dx, dy }) });
    },

    setScale: (id, scale) => {
      const cur = get().layout[id] ?? DEFAULT_PLACEMENT;
      write({ ...get().layout, [id]: sanitise({ ...cur, scale }) });
    },

    clear: (id) => {
      const next = { ...get().layout };
      delete next[id];
      write(next);
    },

    reset: () => write({}),

    customised: () => Object.keys(get().layout).length > 0,
  };
});
