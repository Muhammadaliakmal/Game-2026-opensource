/**
 * The single tunable game-feel config. Times in seconds; frame references
 * assume 60 fps.
 *
 * Per SPEC.md §8 this is the highest-leverage artifact in the build: on a UGC
 * platform, if movement feels bad nothing else matters because players never
 * reach the creative loop. Tune this live before adding content.
 */
export const FEEL = {
  // --- Movement ---
  walkSpeed: 2.5, // -> ecctrl maxWalkVel
  runSpeed: 5.0, // -> ecctrl maxRunVel
  airControl: 0.15, // -> ecctrl airDragFactor (higher = more steering in air)
  accelTime: 0.12, // reach target speed fast, not instant
  decelTime: 0.1, // crisp stop

  // --- Jump ---
  jumpVel: 5.5, // -> ecctrl jumpVel
  coyoteTime: 0.083, // 5 frames @60fps — Celeste's published value
  jumpBuffer: 0.083, // 5 frames — Celeste's published value
  inputBuffer: 0.083, // 5 frames
  jumpCutMultiplier: 0.45, // variable jump height: cut vertical vel on early release
  fallGravityScale: 3.0, // fall faster than rise — the biggest single "feel" lever
  maxFallSpeed: 20,

  // --- Camera ---
  camLag: 0.12, // follow lerp factor (lower = smoother/laggier)
  camLookahead: 0.35, // world units of velocity-based lookahead

  // --- Juice ---
  squashScale: [1.18, 0.82, 1.18] as [number, number, number],
  squashRecover: 0.18,
  landStretch: [0.85, 1.2, 0.85] as [number, number, number],
  hardLandVel: 9, // |verticalSpeed| above this triggers shake + big squash
  shakeAmp: 0.12,
  shakeDur: 0.12,
  shakeFreq: 30,
  hitStop: 0.05, // optional freeze-frames on hard impact

  // --- Juice: particles (dust puffs off the feet) ---
  jumpBurst: 10, // motes kicked up on takeoff
  landBurst: 24, // bigger spray on a hard landing
  particleLife: 0.45, // seconds each mote lives
  particleSpeed: 2.4, // initial outward speed, world units/sec

  // --- Juice: audio (synthesised at runtime — no asset files until Phase 3) ---
  audioVolume: 0.35, // master gain, 0..1
  footstepGap: 0.34, // seconds between footfalls at walk speed (scales with speed)

  // --- Respawn (obby loop) ---
  respawnDelay: 0.25, // near-instant, so failure cost stays near zero
  fallOutY: -20, // below this -> respawn at spawn

  // --- Placement feedback (editor) ---
  placePunchScale: 1.15, // block "punch" pop on placement
  placePunchTime: 0.1,
} as const;
