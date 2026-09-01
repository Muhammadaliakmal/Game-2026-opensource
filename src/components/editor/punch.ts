/**
 * Freshly placed cells, for the placement "punch" (SPEC §8 `placePunchScale`).
 *
 * A plain module Map rather than store state: this is written on every painted
 * cell and read every frame by the instanced renderer, and nothing in the React
 * tree should re-render for it. Keys are grid keys ("x,y,z"); values are the
 * `performance.now()` the punch started. The renderer deletes an entry once its
 * animation is over.
 */
export const punches = new Map<string, number>();

export function punch(key: string) {
  punches.set(key, performance.now());
}
