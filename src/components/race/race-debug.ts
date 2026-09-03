/**
 * Live vehicle telemetry, for finding out why a bike will not move.
 *
 * A plain module object for the same reason race-touch.ts is one: this is
 * written every frame from inside the physics loop, and nothing should
 * re-render sixty times a second to carry a diagnostic. The panel that shows it
 * samples on its own slow timer.
 *
 * Off unless the URL says `?debug=1`, so it costs a boolean check per frame in
 * a normal race and never reaches a player who did not ask for it.
 */

export interface RaceDebug {
  /** Is the throttle allowed through at all — i.e. have the lights gone out. */
  armed: boolean;
  /** What we asked for. */
  wantForward: boolean;
  /** What the vehicle says it received. */
  gotForward: boolean;
  /** Drivetrain. If RPM is dead the engine is not being asked for anything. */
  rpm: number;
  gear: number;
  driveRatio: number;
  /** How fast the body is actually going. */
  speed: number;
  /** Wheels total / wheels with a ground contact. No contact means no grip. */
  wheels: number;
  grounded: number;
  /** Summed drive torque at the wheels, and how fast they are spinning. */
  driveTorque: number;
  wheelSpin: number;
  /** Body height, to catch a chassis resting on the road. */
  y: number;
}

export const raceDebug: RaceDebug = {
  armed: false,
  wantForward: false,
  gotForward: false,
  rpm: 0,
  gear: 0,
  driveRatio: 0,
  speed: 0,
  wheels: 0,
  grounded: 0,
  driveTorque: 0,
  wheelSpin: 0,
  y: 0,
};

/** Read once at module load — a query string does not change under a session. */
export const debugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "1";
