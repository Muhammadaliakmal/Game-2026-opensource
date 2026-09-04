/**
 * Which camera the rider is using.
 *
 * Three views, cycled with one key, because a chase camera is right for
 * learning a track and wrong for placing a wheel on an apex — and because a
 * racing game that offers exactly one view is the one thing every racing game
 * stopped doing decades ago.
 *
 * Module state rather than a store: the bike's frame loop is the only reader,
 * and nothing on screen re-renders when it changes.
 */
export interface RaceCameraMode {
  name: string;
  /** Distance behind the bike. Negative would be in front of it. */
  back: number;
  /** Height above the bike's origin. */
  height: number;
  /** How far above the bike the camera aims. */
  aim: number;
}

export const CAMERA_MODES: RaceCameraMode[] = [
  // The default: far enough back to read a corner before arriving in it.
  { name: "Chase", back: 6.5, height: 2.6, aim: 0.8 },
  // Over the handlebars. Fastest-feeling and hardest — no bike on screen to
  // judge the line by, which is exactly why some riders prefer it.
  { name: "Rider", back: -0.15, height: 1.05, aim: 0.9 },
  // Far: the learning view, and the one that survives a pile-up on the grid.
  { name: "Wide", back: 11, height: 4.6, aim: 0.4 },
];

export const raceCamera = { mode: 0 };

/** Advance to the next view and return its index. */
export function cycleRaceCamera(): number {
  raceCamera.mode = (raceCamera.mode + 1) % CAMERA_MODES.length;
  return raceCamera.mode;
}

/** Back to the chase view — called when a race is left or rejoined. */
export function resetRaceCamera() {
  raceCamera.mode = 0;
}
