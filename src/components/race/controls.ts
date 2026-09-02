import type { KeyboardControlsEntry } from "@react-three/drei";

/**
 * The riding keys.
 *
 * Separate from the on-foot map (components/play/controls.ts) because a
 * vehicle wants different verbs: there is no strafing on a bike, and the
 * left/right keys turn a front wheel rather than sliding a body sideways.
 * ecctrl's VehicleInput names them steerLeft/steerRight, and matching those
 * exactly is what lets Bike forward the whole map in one object.
 */
export type RaceControl =
  | "forward"
  | "backward"
  | "steerLeft"
  | "steerRight"
  | "brake";

export const raceKeyboardMap: KeyboardControlsEntry<RaceControl>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "steerLeft", keys: ["ArrowLeft", "KeyA"] },
  { name: "steerRight", keys: ["ArrowRight", "KeyD"] },
  // Space is the handbrake, which is the same key that jumps on foot — the
  // one control both modes agree means "stop what you are doing".
  { name: "brake", keys: ["Space"] },
];
