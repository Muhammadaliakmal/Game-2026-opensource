/**
 * How the rider is built, as plain numbers.
 *
 * Same split, same reason as `bike-anchors.ts`: these are the measurements the
 * hands and feet are solved against, and proving that the bars are actually
 * within reach must not require a WebGL context. `Rider.tsx` imports them and
 * is the only thing that draws with them.
 *
 * ── Why the arm got longer ───────────────────────────────────────────────
 *
 * It was 0.34 against a 0.59 gap to the bars, so the old rider could not have
 * held on whichever way the shoulder was rotated. 0.63 total is also simply
 * the right number: this body is about 1.32 tall and a human arm is a little
 * under half its owner's height. The limb that could not reach was the limb
 * that was the wrong length.
 *
 * It is sized against the WORST pose, not the resting one. Leaning into a
 * corner rolls the shoulder away from the grip it is holding, which adds
 * about 30mm of reach that a rider sitting still never asks for — and the
 * first version of these numbers was fitted at lean zero, reached 0.598 of a
 * 0.590 arm at full lock, and would have pulled both hands off the bars in
 * exactly the place a player is looking at them. `rider-pose.test.ts` walks
 * every pose for that reason.
 */

/** Segment lengths. The limbs are built from these, and so are the solves. */
export const UPPER = 0.32;
export const FORE = 0.31;
export const THIGH = 0.28;
export const SHIN = 0.26;

/**
 * Where the hips sit on the bike.
 *
 * `ROOT_Z` is a little forward of the saddle's dip, which is how somebody
 * actually sits on a bike with clip-on bars — and it is also what brings the
 * bars inside a human arm's reach. At the old -0.2 the gap was 0.593 against
 * an arm 0.34 long; a rider who had to be part gibbon to hold on was the
 * shape of the bug.
 */
export const ROOT_Y = 0.34;
export const ROOT_Z = -0.15;

/** In the torso's space, so a shoulder stays on the torso through a tuck. */
export const SHOULDER = { x: 0.175, y: 0.15, z: 0 } as const;

/** In the lean group's space — the hips do not fold with the chest. */
export const HIP = { x: 0.16, y: -0.16, z: 0.02 } as const;

/** How far apart the hands are on a 0.52 bar: inboard of the ends. */
export const GRIP_X = 0.2;

/**
 * The rest pose: the torso tipped forward over the tank, and the helmet tipped
 * back out of it so the rider looks up the road rather than at the fuel cap.
 */
export const TORSO_PITCH = 0.42;
export const HELMET_PITCH = -0.3;

/** How much of the fold the helmet takes back, so the eyes stay up the road. */
export const HEAD_LIFT = 0.7;
/** How far the helmet turns to look through a corner, radians at full lock. */
export const HEAD_TURN = 0.3;
/** Vertical travel from the road surface at speed, in units. */
export const BUMP = 0.008;
