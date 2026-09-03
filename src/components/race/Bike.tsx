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
 * self-right stays down and gets thrown by its own wheels. 0.32 is nearly
 * twice the roll lever; it sits just wider than the chassis, close enough to
 * the drawn wheels that nobody clocks it against a five-wide racing surface.
 *
 * The honest alternative was an arcade controller that never falls over
 * because it has no roll axis at all. This keeps real suspension, load
 * transfer under braking and tyre slip — the things that make a corner feel
 * like something — and pays for them with a track width nobody can see.
 */
const HALF_TRACK = 0.32;
const WHEELBASE = 0.75;

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

  /** Put the bike down at a pose, upright and stationary. */
  const place = (h: EcctrlVehicleHandle, pose: Pose) => {
    h.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    quat.current.setFromAxisAngle(UP, pose.yaw);
    h.body.setRotation(quat.current, true);
    h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    flippedFor.current = 0;
    primed.current = false;
  };

  useFrame((_, dt) => {
    const h = ref.current;
    if (!h) return;

    // ── Grid placement ────────────────────────────────────────────────────
    const grid = pending.current;
    if (grid) {
      pending.current = null;
      place(h, grid);
    }

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
  });

  return (
    <EcctrlVehicle
      ref={ref}
      position={spawn}
      rotation={[0, GRID_YAW, 0]}
      carConfig={BIKE_ENGINE}
      /* The racing surface is one block thick. Without continuous collision a
         bike at full speed can step straight past it between two physics
         steps and be underneath the world with nothing to collide against —
         which is the other way a rider ends up staring at the background. */
      ccd
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
          and, unlike a low centre of mass, it does not fight clearance. */}
      <CuboidCollider args={[0.22, 0.2, 0.85]} position={[0, 0.1, 0]} />

      {/* Front pair steers and brakes; rear pair drives and brakes — a bike is
          rear-wheel drive, and giving the front wheels torque would let it pull
          itself out of a slide in a way no rider would recognise. */}
      <ShapeCastWheel
        position={[-HALF_TRACK, 0, WHEELBASE]}
        steerWheel
        brakeWheel
        rayShapeR={0.33}
        rayShapeH={0.08}
        rayLength={0.4}
      />
      <ShapeCastWheel
        position={[HALF_TRACK, 0, WHEELBASE]}
        steerWheel
        brakeWheel
        rayShapeR={0.33}
        rayShapeH={0.08}
        rayLength={0.4}
      />
      <ShapeCastWheel
        position={[-HALF_TRACK, 0, -WHEELBASE]}
        driveWheel
        brakeWheel
        rayShapeR={0.33}
        rayShapeH={0.08}
        rayLength={0.4}
      />
      <ShapeCastWheel
        position={[HALF_TRACK, 0, -WHEELBASE]}
        driveWheel
        brakeWheel
        rayShapeR={0.33}
        rayShapeH={0.08}
        rayLength={0.4}
      />

      <BikeModel color={color} />
      <Rider color={color} steerRef={steer} />
    </EcctrlVehicle>
  );
}
