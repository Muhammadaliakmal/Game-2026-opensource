import type { KeyboardControlsEntry } from "@react-three/drei";

/**
 * The movement keys, shared by every mode that has a player in it.
 *
 * drei only captures keys into a store — ecctrl v2 reads nothing on its own,
 * so Player forwards every field of this map into setMovement each frame.
 */
export type Control =
  | "forward"
  | "backward"
  | "leftward"
  | "rightward"
  | "jump"
  | "run";

export const keyboardMap: KeyboardControlsEntry<Control>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "leftward", keys: ["ArrowLeft", "KeyA"] },
  { name: "rightward", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
];
