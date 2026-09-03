"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useKeyboardControls } from "@react-three/drei";
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
 * ── Why this is not ecctrl's vehicle controller ──────────────────────────
 *
 * It was, for six attempts. `EcctrlVehicle` + `ShapeCastWheel` is a real car
 * model — suspension springs, load transfer, tyre slip through baked curves, an
 * engine with gears — and on this track, at this scale, it went non-finite
 * within the first frames every single time. Telemetry from a real device said
 * so plainly: `rpm NaN`, `torque NaN`, `wheelspin NaN` from frame one, and a
 * render loop dead by frame 15. Wheel spacing, cast radius, ride height, engine
 * torque, ground clearance and centre of mass were all tried; none of them
 * changed it, because NaN is absorbing and there is no way back out of it from
 * outside the controller.
 *
 * SPEC §7.5 anticipated exactly this and named the escape hatch: if ecctrl
 * misbehaves against your Rapier build, drive the body yourself. So this is a
 * plain dynamic rigid body with rotation locked to yaw, and velocity set
 * directly from input.
 *
 * What that costs: no suspension travel, no weight transfer under braking, no
 * slip angle. A corner is a turn rather than a negotiation with the tyres.
 *
 * What it buys: it cannot fall over, it cannot tumble, and — the entire point —
 * there is no solver here to diverge. Every number below is a lerp or a
 * trigonometric identity on values checked finite. An arcade racer is a
 * perfectly respectable thing to be, and one that moves beats a simulation
 * that does not.
 */

/**
 * Top speed, world units per second. A lap of Neon Circuit is roughly 530, so
 * this is about a 29-second lap.
 *
 * Came down from 26. At that speed the track arrived faster than a corner could
 * be read — every mistake was a wall rather than a correction — and the chase
 * camera, which eases toward the heading rather than snapping to it, spent most
 * of a bend looking at the outside of it. The whole braking and coasting set
 * below is scaled with it: change one of these and the bike stops feeling like
 * the same machine.
 */
const MAX_SPEED = 18;
const MAX_REVERSE = 5;
/** Acceleration and braking, in units per second squared. */
const ACCEL = 12;
const BRAKE_DECEL = 26;
/** Coasting drag with nothing held. Gentle: a bike should carry its speed. */
const COAST_DECEL = 4.5;

/**
 * Radians per second of yaw at full lock.
 *
 * Left where it was while the top speed dropped, which tightens the turning
 * circle from about 13.7 units to 9.5 — the reason the slower bike reads as
 * more agile rather than merely slower.
 */
const MAX_YAW_RATE = 1.9;
/**
 * How much speed is needed before steering has full authority.
 *
 * Steering scales with speed for the same reason a real one does — a stationary
 * bike pivoting on the spot reads as a bug — but it is deliberately a low bar,
 * because a racer that will not turn until it is flying is worse. Scaled with
 * MAX_SPEED so full lock still arrives at the same fraction of top speed.
 */
const STEER_FULL_SPEED = 4.5;

/**
 * Ride height. The racing surface tops out at y = 1, and the collider's
 * half-height puts the body origin this far above whatever it rests on.
 */
const HALF_HEIGHT = 0.3;

/** Chase camera: behind and above, easing toward wherever the bike points. */
const CAM_BACK = 6.5;
const CAM_HEIGHT = 2.6;
const CAM_LAG = 0.06;

/**
 * Recovery: the race's answer to Play mode's fall-out respawn.
 *
 * Far less likely to be needed now that nothing can tip, but a bike can still
 * be shoved off an edge, and the chase camera is welded to it — so a bike that
 * leaves the world would take the view with it.
 */
const RECOVER_BELOW_Y = 0.2;

const UP = new THREE.Vector3(0, 1, 0);

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function Bike({ spawn }: { spawn: [number, number, number] }) {
  const body = useRef<RapierRigidBody>(null);
  const [, getKeys] = useKeyboardControls<RaceControl>();
  const camera = useThree((s) => s.camera);
  const selfId = useRaceStore((s) => s.selfId);
  const phase = useRaceStore((s) => s.phase);

  const color = selfId ? bikeColor(selfId) : "#22d3ee";

  /**
   * The server forms the grid, so it also places the bike. A teleport is a
   * frame-loop job, so the message only leaves a pose here.
   */
  const pending = useRef<GridPose | null>(null);
  const home = useRef<Pose | null>(null);
  useEffect(() => {
    setGridListener((pose) => {
      pending.current = pose;
      home.current = { ...pose };
    });
    return () => setGridListener(null);
  }, []);

  /** Signed speed along the bike's own heading. The whole motion model. */
  const speed = useRef(0);
  /** Heading, integrated from steering rather than read back from physics. */
  const heading = useRef(GRID_YAW);

  const quat = useRef(new THREE.Quaternion());
  const eye = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const view = useRef(new THREE.Vector3());
  const primed = useRef(false);
  const safe = useRef<Pose | null>(null);
  const steer = useRef(0);

  /** Put the bike down at a pose, upright and stationary. */
  const place = (b: RapierRigidBody, pose: Pose) => {
    b.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    quat.current.setFromAxisAngle(UP, pose.yaw);
    b.setRotation(quat.current, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    heading.current = pose.yaw;
    speed.current = 0;
    primed.current = false;
  };

  /**
   * Set once if the loop ever throws, so a fault is reported instead of
   * swallowed sixty times a second. The catch stays because a throwing frame
   * loop takes the chase camera — and therefore the whole view — with it.
   */
  const faulted = useRef(false);

  useFrame((_, dt) => {
    const b = body.current;
    if (!b) return;

    try {
      // Clamped: a long frame — a tab waking up, a slow load — must not
      // integrate one enormous step and fling the bike across the map.
      const step = Math.min(dt, 1 / 20);

      // ── Placement and recovery ──────────────────────────────────────────
      const grid = pending.current;
      if (grid) {
        place(b, grid);
        pending.current = null;
      }

      const t = b.translation();
      const lost =
        !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z);

      if (lost || t.y < RECOVER_BELOW_Y) {
        const back = safe.current ?? home.current;
        if (back) {
          place(b, back);
          view.current.set(back.x, back.y, back.z);
        }
      } else {
        view.current.set(t.x, t.y, t.z);
        if (t.y > RECOVER_BELOW_Y + 0.5) {
          safe.current = { x: t.x, y: t.y + 0.1, z: t.z, yaw: heading.current };
        }
      }

      // ── Input ───────────────────────────────────────────────────────────
      const k = getKeys();
      const stick = useJoystickStore.getState().joysticks.default;
      // Nobody drives before the lights.
      const armed = phase === "racing";

      const throttle = armed && (Boolean(k.forward) || raceTouch.throttle);
      const reverse = armed && (Boolean(k.backward) || raceTouch.reverse);
      const braking = Boolean(k.brake) || raceTouch.brake;

      const keySteer = (k.steerRight ? 1 : 0) - (k.steerLeft ? 1 : 0);
      const rawSteer =
        keySteer !== 0 ? keySteer : THREE.MathUtils.clamp(stick?.x ?? 0, -1, 1);
      steer.current = armed ? rawSteer : 0;

      // ── Motion ──────────────────────────────────────────────────────────
      let v = speed.current;
      if (braking) {
        // Pulls toward zero from whichever side it is on, and stops there
        // rather than reversing straight through it.
        v -= Math.sign(v) * BRAKE_DECEL * step;
        if (Math.abs(v) < BRAKE_DECEL * step) v = 0;
      } else if (throttle) {
        v = Math.min(MAX_SPEED, v + ACCEL * step);
      } else if (reverse) {
        v = Math.max(-MAX_REVERSE, v - ACCEL * step);
      } else {
        v -= Math.sign(v) * COAST_DECEL * step;
        if (Math.abs(v) < COAST_DECEL * step) v = 0;
      }
      speed.current = Number.isFinite(v) ? v : 0;

      // Steering authority rises with speed, and inverts in reverse — which is
      // what makes backing off a wall behave the way a rider expects.
      const authority = Math.min(1, Math.abs(speed.current) / STEER_FULL_SPEED);
      const yawRate =
        steer.current * MAX_YAW_RATE * authority * (speed.current < 0 ? -1 : 1);
      heading.current -= yawRate * step;

      // The body is driven, not asked. Rotation is set outright because
      // rotations are locked to yaw, so nothing else is fighting for it.
      quat.current.setFromAxisAngle(UP, heading.current);
      b.setRotation(quat.current, true);

      // X and Z from the heading; Y left alone so gravity still does its job
      // and the bike settles onto the track instead of flying along it.
      const fx = Math.sin(heading.current);
      const fz = Math.cos(heading.current);
      const linvel = b.linvel();
      b.setLinvel(
        {
          x: fx * speed.current,
          y: Number.isFinite(linvel.y) ? linvel.y : 0,
          z: fz * speed.current,
        },
        true
      );

      // ── Presence ────────────────────────────────────────────────────────
      const p = view.current;
      playerFocus.set(p.x, p.y, p.z);
      sendMove(p.x, p.y, p.z, heading.current);

      // ── Chase camera ────────────────────────────────────────────────────
      want.current.set(
        p.x - fx * CAM_BACK,
        p.y + CAM_HEIGHT,
        p.z - fz * CAM_BACK
      );

      if (!primed.current) {
        primed.current = true;
        eye.current.copy(want.current);
      } else {
        eye.current.lerp(want.current, 1 - Math.pow(CAM_LAG, step));
      }

      camera.position.copy(eye.current);
      camera.lookAt(p.x, p.y + 0.8, p.z);
    } catch (e) {
      // Once, not every frame: a fault here repeats at the frame rate, and a
      // console flooded sixty times a second hides the first occurrence, which
      // is the only one that says what happened.
      if (!faulted.current) {
        faulted.current = true;
        console.error("[bike] frame loop faulted", e);
      }
    }
  });

  return (
    <RigidBody
      ref={body}
      position={spawn}
      rotation={[0, GRID_YAW, 0]}
      colliders={false}
      // Yaw only. This one line makes falling over impossible, and with it the
      // whole class of bug that started all this: a bike on its side that the
      // controller could never right.
      enabledRotations={[false, true, false]}
      // Velocity is set outright every frame, so damping would only fight it.
      // Gravity is the one force still allowed to act on its own.
      linearDamping={0}
      angularDamping={0}
      ccd
    >
      <CuboidCollider args={[0.25, HALF_HEIGHT, 0.85]} />
      <BikeModel color={color} />
      <Rider color={color} steerRef={steer} />
    </RigidBody>
  );
}
