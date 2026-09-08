/**
 * Seeded random, and the reason `Math.random` is banned in a game module.
 *
 * A run you cannot reproduce is a bug you cannot fix: "it spawned a gap I
 * could not clear" is unactionable without the seed that made it. It also
 * makes a shared seed a feature — the same course for two players, free.
 *
 * mulberry32: one multiply-xor chain, 32 bits of state, no allocation per
 * call. Not cryptographic and does not need to be — nothing here is a secret.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh run. The one place a game is allowed to be unpredictable. */
export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0;
