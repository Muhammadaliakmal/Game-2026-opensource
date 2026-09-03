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
  /**
   * How many times the bike has been put back.
   *
   * A number that climbs while you sit still means the bike is falling out of
   * the world and being rescued over and over — a very different fault from a
   * bike that simply will not accelerate, and one that looks identical from
   * outside because the rescue puts it straight back where it was.
   */
  rescues: number;
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
  rescues: 0,
};

/**
 * TEMPORARY: on by default while the bike is being diagnosed.
 *
 * It was `?debug=1` opt-in, which does not survive the lobby: starting a race
 * navigates to /race/CODE and builds that URL itself, so the parameter is gone
 * before the panel ever mounts and the one person who needs the numbers cannot
 * get them without hand-editing a URL on a phone.
 *
 * Opt-out instead, until the bike drives. Then this goes back to opt-in — or
 * the whole file goes.
 */
export const debugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") !== "0";
