/**
 * Where a rider meets the bike, as plain numbers and nothing else.
 *
 * Split out of `BikeModel.tsx` for the reason `lib/sky-stops.ts` was split out
 * of `atmosphere.ts`: the anchors are the contract between two files, and the
 * moment anything that is not a renderer needs to read them — a test, a
 * headless check, a server component — importing them must not drag in
 * `@react-three/drei` and the whole of three.js. This file imports nothing.
 *
 * `BikeModel.tsx` re-exports all four, so every existing import still works
 * and there is still one place to read them from.
 *
 * ── Measured, not guessed ────────────────────────────────────────────────
 *
 * `npm run bike:preview` prints the imported model's top-surface profile. The
 * saddle is the dip in it: the top line falls from 0.54 at the tail to 0.35 at
 * z -0.35 and climbs again to 0.55 over the tank. The bars are the widest part
 * of the upper body, which the same probe puts at z +0.4.
 *
 * The procedural fallback bike is built to these too — its own saddle sits at
 * 0.22 against the import's 0.23, a centimetre apart, which is under the
 * thickness of the seat. A rider posed against one bike and drawn on the other
 * sits in the engine.
 */

/** Body space, where the rider group and the bike group both live. */
export const SADDLE = { y: 0.23, z: -0.35 } as const;
export const BARS = { y: 0.23, z: 0.4 } as const;

/**
 * Where the feet go. Beside the chassis, a little ahead of the hips.
 *
 * Added with the rider's IK, which needs a target for the legs for the same
 * reason it needs one for the arms: a foot placed by a hand-tuned angle is a
 * foot that drifts the moment anything above it moves.
 */
export const PEGS = { y: -0.02, z: 0.1, x: 0.19 } as const;

/**
 * How far the whole bike is dropped so its wheels meet the ground.
 *
 * The vehicle's origin is at axle height and the wheels have radius 0.33, so
 * the body hangs below its own origin by this much. It is a named constant
 * because the anchors above are in BODY space while the meshes are in the
 * dropped group's space, and every conversion between the two is this number.
 * Writing it inline three times is how the procedural bike's handlebar came to
 * sit 0.12 away from `BARS` while the comment above claimed the two bikes were
 * built to the same anchors.
 */
export const BIKE_DROP = 0.12;
