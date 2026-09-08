"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The rider sitting on the bike.
 *
 * Deliberately NOT play/CharacterModel. That avatar is a walk-cycle rig: it
 * plants itself at a ground offset derived from ecctrl's floating capsule and
 * drives every joint from `moveSpeed` / `isOnGround` / `verticalSpeed`. A bike
 * has none of those — a rider is seated, their feet never touch the ground, and
 * the only thing that should move is a lean into the corner. Reusing it would
 * have meant feeding it three fake numbers and then cancelling the animation it
 * did with them.
 *
 * Same visual language though — the courier's palette and rounded voxel
 * primitives — so the rider on the bike reads as the same person who walks
 * around a world.
 *
 * Forward is +Z, matching BikeModel and the vehicle body. Everything here is
 * cosmetic; nothing touches physics.
 */

// Shared across every rider on the grid — one allocation per shape, ever.
const G = {
  head: new RoundedBoxGeometry(0.38, 0.32, 0.35, 3, 0.07),
  visor: new RoundedBoxGeometry(0.3, 0.11, 0.06, 2, 0.03),
  torso: new RoundedBoxGeometry(0.34, 0.4, 0.26, 3, 0.08),
  arm: new RoundedBoxGeometry(0.1, 0.34, 0.11, 2, 0.04),
  thigh: new RoundedBoxGeometry(0.12, 0.28, 0.13, 2, 0.045),
  shin: new RoundedBoxGeometry(0.11, 0.26, 0.12, 2, 0.04),
  core: new THREE.SphereGeometry(0.05, 12, 12),
};

/**
 * The suit, shared for the same reason the geometries are.
 *
 * A rider's clothing does not change with the bike colour — only the two
 * emissive accents do — so these four were being rebuilt per rider for no
 * gain. Five riders on a grid is five copies each of a material that is
 * byte-identical, and every copy is its own draw-time state change.
 */
const M = {
  torso: new THREE.MeshStandardMaterial({
    color: "#4f46e5",
    roughness: 0.42,
    metalness: 0.25,
  }),
  helmet: new THREE.MeshStandardMaterial({
    color: "#e8ecff",
    roughness: 0.3,
    metalness: 0.15,
  }),
  arm: new THREE.MeshStandardMaterial({
    color: "#7c3aed",
    roughness: 0.45,
    metalness: 0.2,
  }),
  leg: new THREE.MeshStandardMaterial({
    color: "#312e81",
    roughness: 0.5,
    metalness: 0.2,
  }),
};

/** How far the rider leans into a corner, in radians at full lock. */
const LEAN = 0.38;
/** How quickly the lean catches up. Lower is floatier. */
const LEAN_RATE = 0.12;

/**
 * The rest pose, now that two of these are animated rather than baked into the
 * JSX: the torso tipped forward over the tank, and the helmet tipped back out
 * of it so the rider looks up the road rather than at the fuel cap.
 */
const TORSO_PITCH = 0.42;
const HELMET_PITCH = -0.3;

/**
 * The speed at which the tuck is full, in world units per second.
 *
 * Owned here rather than read off Bike's MAX_SPEED on purpose: a rival's speed
 * arrives as a measured one (see RaceRiders), so this has to be a number about
 * riding rather than a number about the local bike's tuning.
 */
const TUCK_SPEED = 16;
/** How far the rider folds down over the tank at speed, radians. */
const TUCK = 0.16;
/** How much of that the helmet takes back, so the eyes stay up the road. */
const HEAD_LIFT = 0.7;
/** How far the helmet turns to look through a corner, radians at full lock. */
const HEAD_TURN = 0.3;
/** Vertical travel from the road surface at speed, in units. */
const BUMP = 0.008;

export function Rider({
  /** Matches the bike so a rider is told apart at a glance, same as the bike. */
  color = "#22d3ee",
  /**
   * Steering, -1..1, read every frame. A ref rather than a prop so the lean
   * costs no re-render: this sits inside a physics frame loop and the steering
   * value changes every single frame.
   */
  steerRef,
  /**
   * Speed along the road, world units per second, read every frame. Signed is
   * fine — only the magnitude is used. A ref for the same reason `steerRef` is
   * one: this changes every frame and must not re-render anything.
   *
   * Optional, and a rider without it simply sits upright at rest, which is the
   * honest pose for something whose speed is genuinely unknown.
   */
  speedRef,
}: {
  color?: string;
  steerRef?: React.RefObject<number>;
  speedRef?: React.RefObject<number>;
}) {
  const lean = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const helmet = useRef<THREE.Group>(null!);
  const visorMat = useRef<THREE.MeshStandardMaterial>(null!);
  const current = useRef(0);
  const tuck = useRef(0);

  useFrame((state, dt) => {
    if (!lean.current) return;
    const t = state.clock.elapsedTime;

    // Lean the whole rider into the steer. A rider bolt upright through a
    // corner is the single thing that makes a bike read as a prop rather than
    // as something being ridden.
    const steer = steerRef?.current ?? 0;
    const want = -steer * LEAN;
    // Frame-rate independent, like every other easing in this codebase.
    current.current = THREE.MathUtils.lerp(
      current.current,
      want,
      1 - Math.pow(LEAN_RATE, dt)
    );
    lean.current.rotation.z = current.current;

    // ── Speed ──────────────────────────────────────────────────────────────
    // Eased on the same curve as the lean, so a rider does not snap into a
    // tuck the frame the throttle is touched.
    const v = Math.min(1, Math.abs(speedRef?.current ?? 0) / TUCK_SPEED);
    tuck.current = THREE.MathUtils.lerp(tuck.current, v, 1 - Math.pow(LEAN_RATE, dt));
    const folded = tuck.current;

    if (torso.current) {
      // Fold down over the tank as the speed comes up. This is the whole
      // difference between a figure sitting on a bike and a figure riding one:
      // the pose at 5 units/s and the pose at 20 should not be the same pose.
      torso.current.rotation.x = TORSO_PITCH + folded * TUCK;
    }
    if (helmet.current) {
      // The head gives most of the fold back, because a rider tucks their body
      // and not their eyes — the road is still where it was.
      helmet.current.rotation.x = HELMET_PITCH - folded * TUCK * HEAD_LIFT;
      // And looks through the corner rather than at the front wheel.
      helmet.current.rotation.y = -steer * HEAD_TURN;
    }

    // The road, felt rather than seen: a few millimetres of vertical at a
    // frequency that rises with speed. Two waves that do not share a period,
    // so it never settles into a hum. Scaled by speed, so a stationary bike on
    // the grid is perfectly still.
    lean.current.position.y =
      (Math.sin(t * (7 + folded * 22)) + Math.sin(t * (11 + folded * 31)) * 0.5) * BUMP * folded;

    if (visorMat.current) {
      visorMat.current.emissiveIntensity =
        1.7 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
    }
  });

  return (
    // Seated on the saddle. BikeModel is dropped to [0, -0.12, 0] and its seat
    // sits at 0.34 within that, so the saddle is body-space y = 0.22; the rider
    // sits just above it and a little back from centre.
    <group position={[0, 0.34, -0.2]}>
      {/* Roll axis runs along the bike, so the lean pivots about the saddle
          rather than about the rider's own middle. */}
      <group ref={lean}>
        {/* ── Torso, tipped forward over the tank ── */}
        <group ref={torso} rotation={[TORSO_PITCH, 0, 0]}>
          <mesh geometry={G.torso} material={M.torso} castShadow />
          <mesh geometry={G.core} position={[0, 0.04, 0.14]}>
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>

          {/* ── Helmet ── */}
          <group ref={helmet} position={[0, 0.36, 0.04]} rotation={[HELMET_PITCH, 0, 0]}>
            <mesh geometry={G.head} material={M.helmet} castShadow />
            {/* Visor on +Z: the rider faces the way the bike points. */}
            <mesh geometry={G.visor} position={[0, -0.01, 0.16]}>
              <meshStandardMaterial
                ref={visorMat}
                color="#0b1024"
                emissive={color}
                emissiveIntensity={1.7}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>

        {/* ── Arms, reaching down and forward to the bars at y 0.34, z 0.52 ── */}
        {([-0.15, 0.15] as const).map((x) => (
          <group key={x} position={[x, 0.16, 0.14]} rotation={[1.15, 0, 0]}>
            <mesh
              geometry={G.arm}
              material={M.arm}
              position={[0, -0.17, 0]}
              castShadow
            />
          </group>
        ))}

        {/* ── Legs, knees up and forward onto the pegs ── */}
        {([-0.16, 0.16] as const).map((x) => (
          <group key={x} position={[x, -0.18, 0.02]}>
            <group rotation={[0.95, 0, 0]}>
              <mesh
                geometry={G.thigh}
                material={M.leg}
                position={[0, -0.14, 0]}
                castShadow
              />
            </group>
            <group position={[0, -0.24, 0.16]} rotation={[-0.7, 0, 0]}>
              <mesh
                geometry={G.shin}
                material={M.leg}
                position={[0, -0.13, 0]}
                castShadow
              />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
