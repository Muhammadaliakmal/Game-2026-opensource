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

/**
 * The character's live world position, mirrored here each frame by the camera
 * rig. Anything outside <Ecctrl>'s transform that needs to track the player
 * (the shadow-camera light, for one) reads this instead of threading the
 * handle ref through the tree.
 */
export const playerFocus = new THREE.Vector3();

/**
 * Where the follow camera should begin its glide when Play starts.
 *
 * Play used to be a separate page, so the camera simply existed wherever the
 * new canvas put it. Now that Play is a mode of the same canvas, cutting from
 * the orbit view to behind the character would be a jump-cut in the middle of
 * a continuous scene. The rig seeds itself from this once and then eases to
 * the character on its normal camera lag, which is the 500ms glide the UI
 * spec asks for.
 */
export const cameraHandoff = {
  from: new THREE.Vector3(),
  distance: 9,
  pending: false,
};

export const DEFAULT_PITCH = 0.49;
export const THIRD_PERSON_DISTANCE = 9;

const MIN_PITCH = -1.2; // ~-69°, looking up
const MAX_PITCH = 1.35; // ~77°, looking down — short of straight down to avoid gimbal flip
const SENSITIVITY = 0.0032; // radians per CSS pixel of drag

/**
 * Feed a drag delta in CSS pixels.
 *
 * Mouse-look convention: the camera turns the way you drag. Drag right and the
 * view pans right; drag down and it tilts down — the same aim control mobile
 * shooters use. (This used to orbit the world instead, so dragging right swung
 * the scene right and the camera the other way, which read as inverted.)
 *
 * To invert either axis, flip the sign of its term here; this is the only
 * place look direction is decided.
 */
export function applyLook(dx: number, dy: number) {
  look.yaw -= dx * SENSITIVITY;
  look.pitch = THREE.MathUtils.clamp(
    look.pitch + dy * SENSITIVITY,
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
