"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider } from "@react-three/rapier";
import { useKeyboardControls } from "@react-three/drei";
import {
  EcctrlVehicle,
  ShapeCastWheel,
  type EcctrlVehicleHandle,
} from "ecctrl/vehicle";
import { useJoystickStore } from "ecctrl/input";
import { playerFocus } from "@/components/play/camera-rig";
import { setGridListener, type GridPose } from "@/lib/net/race";
import { sendMove } from "@/lib/net/presence";
import { useRaceStore } from "@/stores/race-store";
import { GRID_YAW } from "@/lib/race-track";
import { BikeModel, bikeColor } from "./BikeModel";
import { Rider } from "./Rider";
import type { RaceControl } from "./controls";
import { raceTouch } from "./race-touch";
import { debugEnabled, raceDebug } from "./race-debug";

/**
 * The player's bike.
 *
 * ecctrl's vehicle controller does the driving: ShapeCastWheels take drive,
 * steer and brake demands, evaluate slip through baked tyre curves and apply
 * grip impulses to the body. That is a real car model, and a bike is where it
 * needs the most help — see the wheel layout below.
 */

/**
 * Four contact points, in two pairs.
 *
 * A genuine two-wheeler falls over: nothing holds it upright below the speed
 * at which gyroscopic effects would, and every fix is an invisible torque
 * fighting the rider's own steering. Two pairs give the solver a real base to
 * stand on. At 0.18 that base was 0.36 wide against a 1.5-long body — narrow
 * enough that the drop onto the grid, or the first hard corner, rolled it past
 * the point the vehicle controller can recover from, and a bike with no
 * self-right stays down and gets thrown by its own wheels.
 *
 * It also has to clear WHEEL_R. Each wheel shapecasts a shape of that radius,
 * and at 0.18 — and still at 0.32 — the two casts on an axle overlapped each
 * other in the middle of the bike, both resolving against the same ground at
 * once. ecctrl's own reference car spaces its wheels 2.0 apart with a 0.5
 * radius, a clear gap of 1.0; ours were interpenetrating. That is the most
 * likely source of the degenerate contact that turns the whole drivetrain
 * NaN. 0.34 against a 0.3 radius leaves a real gap.
 *
 * The honest alternative was an arcade controller that never falls over
 * because it has no roll axis at all. This keeps real suspension, load
 * transfer under braking and tyre slip — the things that make a corner feel
 * like something — and pays for them with a track width nobody can see.
 */
const HALF_TRACK = 0.34;
const WHEELBASE = 0.75;

/**
 * Wheel cast shape. Radius doubles as ride height — the body floats about this
 * far above the contact — so it is what decides where the chassis sits.
 *
 * The half-height was 0.08 against a library default of 0.15. A very thin cast
 * shape gives the solver very little to work with; this splits the difference.
 */
const WHEEL_R = 0.3;
const WHEEL_H = 0.12;
const WHEEL_TRAVEL = 0.4;

/**
 * Engine and transmission.
 *
 * Light, revvy and short-geared, because a bike is. These are a starting point
 * rather than a finished tune — the numbers that decide whether a vehicle feels
 * good are the ones you find by driving it.
 */
const BIKE_ENGINE = {
  // Detuned from 180hp/13:1, which looped the bike over backwards on throttle,
  // but not as far as the 110/8 that replaced it — that was cut at the same
  // time the chassis was grounding out, so it took the blame for a standstill
  // it was not causing. This is between the two: enough to accelerate hard out
  // of a corner, not enough to stand it up.
  engineHorsepower: 140,
  engineMaxRPM: 11_000,
  gearRatios: [2.9, 2.0, 1.55, 1.25, 1.0, 0.86],
  finalDriveRatio: 10,
  transmissionMode: "auto" as const,
  shiftUpRPM: 9_400,
  shiftDownRPM: 4_200,
  shiftCooldown: 0.25,
  steerRate: 5,
  maxSteerAngle: 0.55,
};

/** Shared, because the grid can re-form mid-session and a frame loop should
 *  never be the thing that allocates. */
const UP = new THREE.Vector3(0, 1, 0);

/** Chase camera: behind and above, easing toward wherever the bike points. */
const CAM_BACK = 6.5;
const CAM_HEIGHT = 2.6;
const CAM_LAG = 0.06;

/**
 * Recovery: the race's answer to Play mode's fall-out respawn.
 *
 * Play has had one since Phase 2 (FEEL.fallOutY) and the race never got one,
 * which is why a single mistake here was terminal rather than annoying: the
 * chase camera is welded to the bike, so a bike that leaves the world takes the
 * view with it and the player is left staring at the background colour with a
 * live HUD on top — no track, no bike, nothing to do but leave.
 *
 * Two ways to lose a bike, so two triggers:
 *
 *  - BELOW. The racing surface tops out at y = 1. Anything under this is
 *    through the floor or off the edge, and it is never coming back.
 *  - OVER. The vehicle controller has no self-right, so a bike on its side
 *    stays there forever. Measured on the body's own up axis and held for a
 *    moment, because clipping a kerb flicks it briefly and that should cost
 *    time rather than trigger a rescue.
 */
const RECOVER_BELOW_Y = 0.2;
const FLIPPED_UP_Y = 0.35;
const FLIPPED_SECONDS = 2;

/** Where a recovered bike is put back, when we have somewhere better than the grid. */
interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function Bike({ spawn }: { spawn: [number, number, number] }) {
  const ref = useRef<EcctrlVehicleHandle>(null);
  const [, getKeys] = useKeyboardControls<RaceControl>();
  const camera = useThree((s) => s.camera);
  const selfId = useRaceStore((s) => s.selfId);
  const phase = useRaceStore((s) => s.phase);

  const color = selfId ? bikeColor(selfId) : "#22d3ee";

  /**
   * The server forms the grid, so it also places the bike.
   *
   * A teleport is a frame-loop job — the same reason play-actions.ts exists for
   * respawns — so the message only leaves a pose here and the loop below acts
   * on it. Setting a rigid body's translation from a socket callback races the
   * physics step that is already in flight.
   */
  const pending = useRef<GridPose | null>(null);
  /**
   * The grid slot this bike was last given, kept rather than consumed.
   *
   * `pending` is cleared the moment it is acted on, which is right for a
   * teleport but leaves nothing to recover to later. This is the fallback the
   * recovery below uses when the bike has never yet been anywhere safe.
   */
  const home = useRef<Pose | null>(null);
  useEffect(() => {
    setGridListener((pose) => {
      pending.current = pose;
      home.current = { ...pose };
    });
    return () => setGridListener(null);
  }, []);

  const quat = useRef(new THREE.Quaternion());
  const eye = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const fwd = useRef(new THREE.Vector3());
  const primed = useRef(false);
  /**
   * The position everything downstream is allowed to see.
   *
   * Never NaN, which `h.currPos` can be. The camera, the shadow focus and the
   * presence packet all read this instead of the body, so one bad physics step
   * cannot reach the renderer.
   */
  const view = useRef(new THREE.Vector3());
  /** Last place the bike was upright, on the road and the right way up. */
  const safe = useRef<Pose | null>(null);
  const flippedFor = useRef(0);
  /** Live steering, for the rider's lean. A ref: this changes every frame. */
  const steer = useRef(0);

  /**
   * Rebuilds the whole vehicle when its drivetrain goes NaN.
   *
   * `place()` below can put a body back where it belongs, and that is enough
   * for a position that has gone bad. It is not enough for this: engine RPM,
   * wheel angular velocity and drive torque live inside the controller, and
   * once any of them is NaN every later frame multiplies NaN by something and
   * gets NaN back. The bike then sits exactly where it is told, perfectly
   * upright, computing a torque of NaN and applying nothing, forever. From
   * outside that is indistinguishable from a bike that simply will not
   * accelerate — which is what it looked like for three attempts.
   *
   * There is no API for "reset your internals", so this changes the `key` and
   * lets React build a new one. Rate-limited and capped, because a remount
   * that immediately goes NaN again would otherwise be an infinite loop that
   * costs a Rapier body every frame.
   */
  /**
   * Put the bike down at a pose, upright and stationary. Answers whether it
   * actually happened.
   *
   * `handle.body` is a live getter for the vehicle's rigid body, and it returns
   * null whenever there is not one yet — the first frames after mounting, and
   * again after every remount. Calling straight through it, which this did,
   * threw "Cannot read properties of null (reading 'setTranslation')" on the
   * very first line of the frame, every frame.
   *
   * That is the whole bug. Placement runs at the top of the frame, so the throw
   * aborted it before the input block further down was ever reached: the
   * throttle was never handed to the vehicle at all. No amount of tuning
   * torque, clearance or wheel geometry was going to move a bike whose
   * setMovement call had never once executed.
   */
  const place = (h: EcctrlVehicleHandle, pose: Pose): boolean => {
    const body = h.body;
    if (!body) return false;
    body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    quat.current.setFromAxisAngle(UP, pose.yaw);
    body.setRotation(quat.current, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    flippedFor.current = 0;
    primed.current = false;
    raceDebug.rescues++;
    return true;
  };

  /**
   * The actual per-frame work, called from useFrame below inside a try.
   *
   * Split out so the loop above can count frames and catch throws before this
   * runs: an exception in a frame callback takes the whole render loop with it,
   * which is what the "That did not load" screen was.
   */
  function frame(dt: number, h: EcctrlVehicleHandle) {

    // ── Grid placement ────────────────────────────────────────────────────
    // Cleared only once it has actually happened. Clearing first threw the
    // grid slot away on the frames where there was no body to place yet, so a
    // bike could miss its slot entirely and never be told again.
    const grid = pending.current;
    if (grid && place(h, grid)) pending.current = null;

    // ── Recovery ──────────────────────────────────────────────────────────
    // Before anything reads the position, because everything downstream —
    // presence, the chase camera — should see the recovered bike, not spend a
    // frame following the lost one.
    const pos = h.currPos;
    const upright = h.bodyYAxis?.y ?? 1;

    /**
     * NaN is the failure that matters, and it has to be tested for by name.
     *
     * When the vehicle solver blows up — a bad contact, a huge impulse — the
     * body's translation goes to NaN, and from there `camera.position.copy()`
     * hands three.js an unusable matrix and the renderer draws nothing at all.
     * That is the black screen: not a camera pointed at empty space, a camera
     * that cannot be resolved.
     *
     * The trap is that NaN cannot be caught by the check below it. Every
     * comparison against NaN is false — `NaN < 0.2` is false, so is
     * `NaN > 0.9` — so a bike that has gone non-finite sails through a
     * `pos.y < RECOVER_BELOW_Y` guard untouched, forever. It has to be asked
     * about directly, before any inequality gets a chance to answer "no".
     */
    const lost =
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z);

    /**
     * The drivetrain rebuild that used to live here is gone.
     *
     * It swapped this component's `key` to force a fresh vehicle, on the theory
     * that a NaN engine cannot be repaired in place. What it actually did was
     * destroy the rigid body — `handle.body` is a live getter and returns null
     * while there is not one — so the next frame threw on `setTranslation` and
     * took the input block down with it. A cure that guaranteed the disease.
     *
     * If NaN is still real once the throttle genuinely reaches the wheels, it
     * gets solved at its source rather than by demolition.
     */

    flippedFor.current =
      !lost && upright < FLIPPED_UP_Y ? flippedFor.current + dt : 0;

    if (lost || pos.y < RECOVER_BELOW_Y || flippedFor.current > FLIPPED_SECONDS) {
      // Last good spot for preference — being dropped back where you fell off
      // is a racing convention and costs you the time rather than the race.
      // The grid is the fallback for a bike that has never been anywhere good,
      // which is exactly the case that used to end in a black screen.
      const back = safe.current ?? home.current;
      if (back) {
        place(h, back);
        // `h.currPos` is Rapier's, and it does not change until the next step —
        // so for the rest of THIS frame it still reads NaN. Everything below
        // works off `view`, which is why the camera survives the frame the
        // rescue happens on rather than being handed the bad value one last
        // time and blacking out anyway.
        view.current.set(back.x, back.y, back.z);
      }
    } else {
      view.current.copy(pos);
      if (upright > 0.9 && pos.y > RECOVER_BELOW_Y + 0.5) {
        // Remember this spot, lifted to the bike's own rest height so a
        // recovery never puts it back inside the road it was resting on.
        fwd.current.set(0, 0, 1).applyQuaternion(h.currQuat);
        safe.current = {
          x: pos.x,
          y: pos.y + 0.1,
          z: pos.z,
          yaw: Math.atan2(fwd.current.x, fwd.current.z),
        };
      }
    }

    // ── Input ─────────────────────────────────────────────────────────────
    const k = getKeys();
    const stick = useJoystickStore.getState().joysticks.default;
    // Nobody drives before the lights. Holding the throttle through the
    // countdown is fine and expected — it simply does nothing until "racing",
    // which is also what stops anyone jumping the start.
    const armed = phase === "racing";

    h.setMovement({
      forward: armed && (Boolean(k.forward) || raceTouch.throttle),
      backward: armed && (Boolean(k.backward) || raceTouch.reverse),
      steerLeft: armed && Boolean(k.steerLeft),
      steerRight: armed && Boolean(k.steerRight),
      // Braking is allowed at any time: it is the only way to stop rolling
      // backwards off a grid slot on a track that is not perfectly flat.
      brake: Boolean(k.brake) || raceTouch.brake,
      // The thumbstick steers. Its x is negated inside the controller, so
      // pushing right steers right — no sign correction needed here.
      joystickL: { x: armed ? (stick?.x ?? 0) : 0, y: 0 },
    });

    // What the rider leans into. Keys are all-or-nothing, the stick is
    // proportional; whichever is actually being used wins.
    const keySteer = (k.steerRight ? 1 : 0) - (k.steerLeft ? 1 : 0);
    steer.current = armed
      ? keySteer !== 0
        ? keySteer
        : THREE.MathUtils.clamp(stick?.x ?? 0, -1, 1)
      : 0;

    // ── Telemetry (?debug=1 only) ─────────────────────────────────────────
    // Reads what the vehicle actually did with the input, so "it will not
    // move" can be answered with a number instead of a theory: whether the
    // throttle got through, whether the engine turned, whether any torque
    // reached a wheel, and whether a wheel was touching the ground to put it
    // into.
    if (debugEnabled) {
      const d = raceDebug;
      d.armed = armed;
      d.wantForward = Boolean(k.forward) || raceTouch.throttle;
      d.gotForward = Boolean(h.input?.forward);
      d.rpm = h.engineRPM;
      d.gear = h.gearIndex;
      d.driveRatio = h.driveRatio;
      d.speed = h.currLinVel?.length?.() ?? 0;
      d.y = pos.y;

      let wheels = 0;
      let grounded = 0;
      let torque = 0;
      let spin = 0;
      h.wheelsInfo?.forEach((w) => {
        const info = w.current;
        if (!info) return;
        wheels++;
        if (info.rayHit) grounded++;
        torque += info.driveTorque ?? 0;
        if (info.driveWheel) spin = Math.max(spin, Math.abs(info.wheelAngVel ?? 0));
      });
      d.wheels = wheels;
      d.grounded = grounded;
      d.driveTorque = torque;
      d.wheelSpin = spin;
    }

    // ── Presence ──────────────────────────────────────────────────────────
    // `view` rather than the body: recovery has already had its say above, and
    // this is guaranteed finite. A NaN reaching playerFocus would take the
    // follow-sun's shadow camera down with the view camera.
    const p = view.current;
    playerFocus.set(p.x, p.y, p.z);

    // Facing from the body, not the camera: on a bike where you are pointed is
    // the whole state a rival needs, and it is what the server's sector test
    // has to agree with.
    fwd.current.set(0, 0, 1).applyQuaternion(h.currQuat);
    // The rotation can go bad in the same step the position does; falling back
    // to the grid heading keeps the chase camera pointing along the track
    // instead of multiplying the NaN onward into the camera basis.
    if (!Number.isFinite(fwd.current.x) || !Number.isFinite(fwd.current.z)) {
      fwd.current.set(1, 0, 0);
    }
    const yaw = Math.atan2(fwd.current.x, fwd.current.z);
    sendMove(p.x, p.y, p.z, yaw);

    // ── Chase camera ──────────────────────────────────────────────────────
    // Behind along the bike's own heading rather than a free look: a racing
    // camera that does not point where the vehicle points is a camera you
    // cannot take a corner with.
    want.current.set(
      p.x - fwd.current.x * CAM_BACK,
      p.y + CAM_HEIGHT,
      p.z - fwd.current.z * CAM_BACK
    );

    if (!primed.current) {
      primed.current = true;
      eye.current.copy(want.current);
    } else {
      // Frame-rate independent, like the on-foot rig: without the dt scaling
      // the lag would differ between a 60Hz and a 144Hz display.
      eye.current.lerp(want.current, 1 - Math.pow(CAM_LAG, dt));
    }

    camera.position.copy(eye.current);
    camera.lookAt(p.x, p.y + 0.8, p.z);
  }

  useFrame((_, dt) => {
    // Counted first, before any early return and outside the try below, so it
    // keeps moving no matter what the rest of this does. If everything else is
    // frozen and this is not, the loop is alive and something inside is
    // returning early; if this is frozen too, the loop itself is gone.
    raceDebug.frames++;
    raceDebug.phase = phase;

    const h = ref.current;
    if (!h) {
      // A remount that never handed the ref back. `place()` cannot run, the
      // camera cannot follow, and every number below stays at whatever it was
      // when the old vehicle was thrown away.
      raceDebug.noHandle++;
      return;
    }

    try {
      frame(dt, h);
    } catch (e) {
      // An exception here would otherwise take the whole render loop down with
      // it — which is what the "That did not load" screen was.
      raceDebug.error = e instanceof Error ? e.message : String(e);
    }
  });

  return (
    <EcctrlVehicle
      ref={ref}
      position={spawn}
      rotation={[0, GRID_YAW, 0]}
      carConfig={BIKE_ENGINE}
    >
      {/* Narrow and long, so the mass sits where the model looks like it does.
          Sat at axle height rather than below it, and shallower than the model
          it stands for. That is ground clearance, and it is not optional: the
          bike rests about a wheel radius (0.33) up, less whatever the
          suspension is compressing, so a chassis reaching much below the axle
          line ends up on the road instead of on its tyres. Beached like that
          the wheels carry no load, generate no grip, and the throttle does
          nothing at all — a bike that looks perfect parked and cannot move.
          Roll stability comes from HALF_TRACK above; width is the better lever
          and, unlike a low centre of mass, it does not fight clearance.

          Telemetry said the last attempt was not enough: resting at y 1.16 put
          the underside at 1.06 against a road at 1.0, six centimetres, and only
          two of four wheels were finding ground. The box now stops at the axle
          line — underside at body-y 0.0 — so the wheels carry the bike and the
          chassis is nowhere near the road. */}
      <CuboidCollider args={[0.22, 0.16, 0.85]} position={[0, 0.16, 0]} />

      {/* Front pair steers and brakes; rear pair drives and brakes — a bike is
          rear-wheel drive, and giving the front wheels torque would let it pull
          itself out of a slide in a way no rider would recognise. */}
      <ShapeCastWheel
        position={[-HALF_TRACK, 0, WHEELBASE]}
        steerWheel
        brakeWheel
        rayShapeR={WHEEL_R}
        rayShapeH={WHEEL_H}
        rayLength={WHEEL_TRAVEL}
      />
      <ShapeCastWheel
        position={[HALF_TRACK, 0, WHEELBASE]}
        steerWheel
        brakeWheel
        rayShapeR={WHEEL_R}
        rayShapeH={WHEEL_H}
        rayLength={WHEEL_TRAVEL}
      />
      <ShapeCastWheel
        position={[-HALF_TRACK, 0, -WHEELBASE]}
        driveWheel
        brakeWheel
        rayShapeR={WHEEL_R}
        rayShapeH={WHEEL_H}
        rayLength={WHEEL_TRAVEL}
      />
      <ShapeCastWheel
        position={[HALF_TRACK, 0, -WHEELBASE]}
        driveWheel
        brakeWheel
        rayShapeR={WHEEL_R}
        rayShapeH={WHEEL_H}
        rayLength={WHEEL_TRAVEL}
      />

      <BikeModel color={color} />
      <Rider color={color} steerRef={steer} />
    </EcctrlVehicle>
  );
}
