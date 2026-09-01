import * as THREE from "three";
import { create } from "zustand";

/**
 * Camera look state.
 *
 * Yaw/pitch/distance live in a plain module object rather than store state on
 * purpose: they change on every pointer move and every frame, and nothing in
 * the React tree should re-render for them. Only the camera rig reads them, in
 * its frame loop.
 *
 * Movement follows the camera for free — ecctrl derives its forward direction
 * from `camera.getWorldDirection()` each frame (its `useCustomForward` default
 * is false), so rotating the camera is all that's needed for W to mean "away
 * from the viewer". No `setForwardDir` plumbing required.
 */
export const look = {
  /** Radians. Matches the old fixed (8, 6, 8) offset so the default view is unchanged. */
  yaw: Math.PI / 4,
  pitch: 0.49,
  /** Written by the rig each frame; read by the avatar to hide itself up close. */
  distance: 9,
};

export const DEFAULT_PITCH = 0.49;
export const THIRD_PERSON_DISTANCE = 9;

const MIN_PITCH = -1.2; // ~-69°, looking up
const MAX_PITCH = 1.35; // ~77°, looking down — short of straight down to avoid gimbal flip
const SENSITIVITY = 0.0032; // radians per CSS pixel of drag

/** Feed a drag delta in CSS pixels. */
export function applyLook(dx: number, dy: number) {
  look.yaw -= dx * SENSITIVITY;
  look.pitch = THREE.MathUtils.clamp(
    look.pitch - dy * SENSITIVITY,
    MIN_PITCH,
    MAX_PITCH
  );
}

/** Level the view out again without disturbing which way you're facing. */
export function recenterPitch() {
  look.pitch = DEFAULT_PITCH;
}

interface ViewState {
  firstPerson: boolean;
  toggleFirstPerson(): void;
}

/** Low-frequency, so this one is real store state the HUD can render from. */
export const useViewStore = create<ViewState>((set) => ({
  firstPerson: false,
  toggleFirstPerson: () =>
    set((s) => ({ firstPerson: !s.firstPerson })),
}));
