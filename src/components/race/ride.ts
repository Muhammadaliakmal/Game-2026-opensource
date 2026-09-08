/**
 * How a rider sits on a bike, as numbers — shared by both kinds of rider.
 *
 * There are two now: the procedural voxel courier (`VoxelRider`) and the shop
 * characters (`RiderRig`), drawn by completely different code. They must lean
 * and tuck identically, for exactly the reason `gait.ts` gives about the two
 * kinds of avatar: a rider who bought a character and a rider who did not are
 * side by side on the same grid, and a second copy of "how far does a rider
 * lean" drifts from the first the day somebody retunes one of them.
 */

/** How far the rider leans into a corner, in radians at full lock. */
export const LEAN = 0.38;

/** How quickly the lean catches up. Lower is floatier. */
export const LEAN_RATE = 0.12;

/**
 * The speed at which the tuck is full, in world units per second.
 *
 * Owned here rather than read off Bike's MAX_SPEED on purpose: a rival's speed
 * arrives as a measured one (see RaceRiders), so this has to be a number about
 * riding rather than a number about the local bike's tuning.
 */
export const TUCK_SPEED = 16;

/** How far the rider folds down over the tank at speed, radians. */
export const TUCK = 0.16;
