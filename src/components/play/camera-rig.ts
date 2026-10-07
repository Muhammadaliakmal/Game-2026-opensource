import * as THREE from "three";
import { create } from "zustand";
import { lookInvertY, lookSensitivity } from "@/lib/player-settings";

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
  /**
   * How far back the player WANTS the eye, before the world has its say.
   *
   * Scroll on a mouse, pinch on a phone. `distance` above is what the rig
   * actually managed after pulling in for walls; this is the request, and it
   * survives the pull-in so the camera glides back out to it afterwards.
   */
  zoom: 9,
  /**
   * `performance.now()` of the last deliberate look input.
   *
   * The touch camera steers itself toward wherever the player is running, and
   * it must never do that while a thumb is actually on the screen dragging —
   * a camera that fights the hand holding it is worse than one that does
   * nothing. One timestamp covers every way a look can be manual (drag,
   * pointer-lock mouse) because they all land in applyLook.
   */
  manualAt: 0,
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

/**
 * The zoom range. Close enough to read a ledge under your feet, far enough to
 * see the next three jumps — the band every third-person platformer offers.
 * The minimum stays well clear of `CAMERA_MIN_DISTANCE`, where the avatar
 * starts hiding itself; zooming in further is what first person is for.
 */
export const ZOOM_MIN = 3.5;
export const ZOOM_MAX = 16;

const MIN_PITCH = -1.2; // ~-69°, looking up
const MAX_PITCH = 1.35; // ~77°, looking down — short of straight down to avoid gimbal flip
/** Radians per CSS pixel of drag, at a sensitivity of 1. */
export const BASE_SENSITIVITY = 0.0032;
/**
 * Vertical look runs slower than horizontal. Roblox's camera module uses
 * about three quarters for a mouse and two thirds for a thumb: a drag is
 * rarely perfectly level, and at equal rates every sideways turn tilts the
 * horizon too, which is most of what "the camera feels twitchy" means.
 */
export const VERTICAL_RATIO = 0.75;

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
 *
 * `source` picks which of the player's two sensitivities scales the delta —
 * see `lookSensitivity` in `lib/player-settings.ts` for why there are two.
 */
export function applyLook(dx: number, dy: number, source: "mouse" | "touch") {
  if (dx !== 0 || dy !== 0) look.manualAt = performance.now();
  const k = BASE_SENSITIVITY * lookSensitivity(source);
  const sy = lookInvertY() ? -1 : 1;
  look.yaw -= dx * k;
  look.pitch = THREE.MathUtils.clamp(
    look.pitch + dy * k * sy * VERTICAL_RATIO,
    MIN_PITCH,
    MAX_PITCH
  );
}

/**
 * Zoom by a factor: below 1 moves the eye in, above 1 moves it out.
 *
 * Multiplicative rather than additive so one notch of the wheel, or one
 * pinch of the same proportion, feels the same at 4 units as at 14 — an
 * additive step is a lurch up close and a crawl far out.
 */
export function applyZoom(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  look.zoom = THREE.MathUtils.clamp(look.zoom * factor, ZOOM_MIN, ZOOM_MAX);
}

/**
 * Level the view out and bring the zoom home, without disturbing which way
 * you're facing. One button undoes everything a hand can do to the camera
 * except turn it — and turning it is the one thing nobody wants undone.
 */
export function recenterPitch() {
  look.pitch = DEFAULT_PITCH;
  look.zoom = THIRD_PERSON_DISTANCE;
}

/**
 * The camera yaw that looks along a horizontal direction.
 *
 * The rig places the eye at `+offset` from the character and then looks back
 * down that offset, so the direction the player sees along is the negation of
 * `(sin yaw, cos yaw)` — which is why this is not simply `atan2(x, z)`. Getting
 * the sign wrong here points the camera at the back of the character's head,
 * so it is worth having in one named place.
 */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/**
 * Ease one angle toward another the short way round.
 *
 * A plain lerp between 3.1 and -3.1 radians takes the long way and spins the
 * camera most of a full turn, which is exactly the case a character crossing
 * due north produces.
 */
export function approachYaw(current: number, target: number, t: number): number {
  const TAU = Math.PI * 2;
  const delta = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return current + delta * t;
}

/**
 * How long after the player stops dragging before the touch camera resumes
 * steering itself, and how hard it pulls once it does.
 *
 * The delay is what stops it snatching the view back the instant a thumb
 * lifts. It was 450 ms, and that was the snatch: a player who dragged the
 * view to check a ledge had it swung away before they had read it. Roblox's
 * follow mode waits two seconds; a second and a half keeps most of that
 * patience without the camera feeling asleep. The rate is a per-second decay constant fed through
 * `1 - pow(rate, dt)`, so it is frame-rate independent; 0.08 is a time
 * constant of roughly four tenths of a second, slow enough to read as the
 * camera trailing the character rather than being bolted to it.
 */
export const AUTO_FOLLOW_DELAY = 1500;
/**
 * How long a look counts as "the player is turning right now" for the
 * thumbstick's frame hold (`stick.ts`). Deliberately its own number: it was
 * the follow delay's until that grew, and the stick should keep the short
 * window it was tuned against.
 */
export const MANUAL_LOOK_WINDOW = 450;
export const AUTO_FOLLOW_RATE = 0.08;
/** Below this ground speed there is no meaningful direction to follow. */
export const AUTO_FOLLOW_MIN_SPEED = 0.8;

interface ViewState {
  firstPerson: boolean;
  toggleFirstPerson(): void;
  /**
   * Whether the browser has handed us the mouse.
   *
   * Mirrored from `document.pointerLockElement` by the look controls rather
   * than set by whoever asked for the lock: the user can drop it at any time
   * with Esc, and the HUD hint has to follow the browser, not our intent.
   */
  pointerLocked: boolean;
  setPointerLocked(locked: boolean): void;
}

/** Low-frequency, so this one is real store state the HUD can render from. */
export const useViewStore = create<ViewState>((set) => ({
  firstPerson: false,
  toggleFirstPerson: () =>
    set((s) => ({ firstPerson: !s.firstPerson })),
  pointerLocked: false,
  setPointerLocked: (locked) =>
    set((s) => (s.pointerLocked === locked ? s : { pointerLocked: locked })),
}));
