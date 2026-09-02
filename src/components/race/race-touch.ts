/**
 * Thumb inputs for riding.
 *
 * A plain module object, not a store: these are read every frame by the bike's
 * frame loop and nothing should re-render sixty times a second for a button
 * being held. Same reasoning as play/touch-input.ts.
 *
 * All three are momentary. A latched throttle sounds convenient and is not —
 * on a track with walls, "I cannot stop" is the one state a rider must never
 * be able to reach by accident.
 */
export const raceTouch = { throttle: false, brake: false, reverse: false };
