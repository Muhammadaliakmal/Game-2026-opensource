"use client";

import * as THREE from "three";
import { Suspense, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DEFAULT_CHARACTER, characterFor } from "@/lib/characters";
import { DESIGNS, designFor, type CharacterDesign } from "@/lib/character-design";
import { solid } from "@/components/play/block-materials";
import { LEAN, LEAN_RATE, TUCK, TUCK_SPEED } from "./ride";
import { BARS, PEGS } from "./BikeModel";
import { solveArm } from "./arm-ik";
import {
  BUMP,
  FORE,
  GRIP_X,
  HEAD_LIFT,
  HEAD_TURN,
  HELMET_PITCH,
  HIP,
  ROOT_Y,
  ROOT_Z,
  SHIN,
  SHOULDER,
  THIGH,
  TORSO_PITCH,
  UPPER,
} from "./rider-pose";
import { RiderRig } from "./RiderRig";

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
 *
 * ── The hands are solved, not posed ──────────────────────────────────────
 *
 * They used to be a shoulder offset and one rotation, and they finished 0.77
 * units behind the handlebars — half the length of the bike — because the
 * rotation's sign sent a hanging limb backwards and the arm was too short to
 * have reached anyway. See `arm-ik.ts` for the diagnosis.
 *
 * Both pairs of limbs now end where the bike says they should: the arms at
 * `BARS`, the legs at `PEGS`. That is a constraint rather than a pose, which
 * is what makes the rest of this file free to move — the torso folds into a
 * tuck, the whole rider rolls into a corner, the road shakes the seat, and
 * the hands stay on the grips through all of it without a single correction
 * term. The old rig needed `ELBOW_ABSORB` to cancel a tuck it could not
 * otherwise survive; there is no such number here because nothing has to be
 * cancelled.
 */

/*
  Shared across every rider on the grid — one allocation per shape, ever.

  ── What casts a shadow, and what does not ─────────────────────────────────

  The detail added here — gloves, boots, a pack, pauldrons, a belt, a crest —
  roughly doubled the rider's mesh count, and a shadow caster is not free: the
  shadow map is re-rendered from the sun every frame, so every `castShadow`
  mesh is a second draw of that mesh. Four riders make that arithmetic matter.

  So the small trim does not cast. At the distance a rival is actually seen
  from, a glove's shadow lands inside the bike's own and changes nothing, and
  a 10cm box against a 512-2048px map covering the whole shadow box is below
  one texel anyway. The parts that set the silhouette — chest, belly, helmet,
  the four limb segments — still cast.
*/
const G = {
  head: new RoundedBoxGeometry(0.36, 0.34, 0.38, 3, 0.09),
  visor: new RoundedBoxGeometry(0.3, 0.12, 0.06, 2, 0.03),
  /** Chest and abdomen, so the torso tapers instead of being one slab. */
  chest: new RoundedBoxGeometry(0.36, 0.26, 0.28, 3, 0.08),
  belly: new RoundedBoxGeometry(0.3, 0.18, 0.24, 3, 0.07),
  upper: new RoundedBoxGeometry(0.11, UPPER, 0.12, 2, 0.045),
  fore: new RoundedBoxGeometry(0.095, FORE, 0.105, 2, 0.04),
  glove: new RoundedBoxGeometry(0.115, 0.12, 0.13, 2, 0.045),
  thigh: new RoundedBoxGeometry(0.135, THIGH, 0.15, 2, 0.05),
  shin: new RoundedBoxGeometry(0.115, SHIN, 0.125, 2, 0.04),
  boot: new RoundedBoxGeometry(0.13, 0.1, 0.2, 2, 0.04),
  pauldron: new RoundedBoxGeometry(0.15, 0.11, 0.19, 2, 0.05),
  pack: new RoundedBoxGeometry(0.24, 0.2, 0.1, 2, 0.04),
  belt: new RoundedBoxGeometry(0.32, 0.05, 0.26, 2, 0.02),
  core: new THREE.SphereGeometry(0.05, 12, 12),
  antenna: new THREE.CylinderGeometry(0.008, 0.012, 0.2, 6),
  horn: new THREE.ConeGeometry(0.035, 0.12, 6),
  brim: new RoundedBoxGeometry(0.34, 0.03, 0.12, 2, 0.012),
  spine: new THREE.ConeGeometry(0.022, 0.09, 5),
};

/**
 * ── The suit is the character now ────────────────────────────────────────
 *
 * These four were fixed colours — one indigo torso, one white helmet — which
 * was correct while every rider was the same voxel courier and only the two
 * emissive accents varied with the bike. It stopped being correct the moment
 * the roster became procedural: with no GLB left in the catalogue, `Rider`
 * always takes the voxel branch, so a player who bought Frostbound and went
 * racing got the courier's suit with a different glow on it. Buying a
 * character has to change what you see on the bike, or it is not a purchase.
 *
 * So the palette comes from the design, through the SAME module-level cache
 * the on-foot avatar uses (`play/block-materials`). One cache, so a character
 * is one set of materials whether it is running or riding — two caches is how
 * the same blue comes out slightly different in two modes.
 *
 * The numbers below are what stops a character reading as one moulded object.
 * A suit is cloth, a pauldron is a hard shell, a boot is scuffed, a helmet is
 * lacquered — four different answers to the same light, where there used to
 * be one. The weave in `block-materials` does the rest.
 */
const FINISH = {
  suit: [0.62, 0.08],
  helmet: [0.18, 0.35],
  limb: [0.7, 0.04],
  boot: [0.82, 0.02],
  trim: [0.34, 0.66],
  glove: [0.76, 0.03],
} as const;

/**
 * Which way each joint breaks.
 *
 * An elbow and a knee can each reach the same target two ways, and only one
 * of them is a person: the elbows drop down and outward, the knees rise
 * forward. These are directions in the space the solve happens in, so the
 * elbows are in the torso's frame and the knees are in the lean group's.
 */
const ELBOW_POLE_L = new THREE.Vector3(-0.55, -1, -0.15).normalize();
const ELBOW_POLE_R = new THREE.Vector3(0.55, -1, -0.15).normalize();
const KNEE_POLE = new THREE.Vector3(0, 1, 0.45).normalize();

/** Scratch for the per-frame solves. Shared, like the geometries. */
const _target = new THREE.Vector3();
const _shoulderL = new THREE.Vector3(-SHOULDER.x, SHOULDER.y, SHOULDER.z);
const _shoulderR = new THREE.Vector3(SHOULDER.x, SHOULDER.y, SHOULDER.z);
const _hipL = new THREE.Vector3(-HIP.x, HIP.y, HIP.z);
const _hipR = new THREE.Vector3(HIP.x, HIP.y, HIP.z);

/** The hard trim on a helmet, per design. Shapes, not a texture. */
function Crest({ design }: { design: CharacterDesign }) {
  const m = solid(design.trim, FINISH.trim[0], FINISH.trim[1]);
  switch (design.crest) {
    case "antenna":
      return <mesh geometry={G.antenna} material={m} position={[0.1, 0.22, -0.04]} />;
    case "horns":
      return (
        <>
          <mesh geometry={G.horn} material={m} position={[-0.15, 0.16, -0.02]} rotation={[0, 0, 0.5]} />
          <mesh geometry={G.horn} material={m} position={[0.15, 0.16, -0.02]} rotation={[0, 0, -0.5]} />
        </>
      );
    case "brim":
      return <mesh geometry={G.brim} material={m} position={[0, 0.02, 0.18]} rotation={[0.24, 0, 0]} />;
    case "spines":
      return (
        <>
          {([-0.07, 0.02, 0.11] as const).map((z) => (
            <mesh key={z} geometry={G.spine} material={m} position={[0, 0.19, z]} rotation={[-0.35, 0, 0]} />
          ))}
        </>
      );
  }
}

export function VoxelRider({
  /** Matches the bike so a rider is told apart at a glance, same as the bike. */
  color = "#22d3ee",
  /**
   * Which character is riding.
   *
   * Distinct from `color`, which is the BIKE's colour and is assigned per
   * connection so two riders are told apart on a grid. A character is chosen
   * and paid for; a bike colour is handed out. They are allowed to disagree,
   * and on a four-bike grid they have to — two players wearing the same
   * character still need different bikes.
   */
  design = DESIGNS.courier,
  /**
   * Steering, -1..1, read every frame. A ref rather than a prop so the lean
   * costs no re-render: this sits inside a physics frame loop and the steering
   * value changes every single frame.
   */
  steerRef,
  /**
   * Speed along the road, world units per second, read every frame. Signed is
   * fine — only the magnitude is used.
   *
   * Optional, and a rider without it simply sits upright at rest, which is the
   * honest pose for something whose speed is genuinely unknown.
   */
  speedRef,
}: {
  color?: string;
  design?: CharacterDesign;
  steerRef?: React.RefObject<number>;
  speedRef?: React.RefObject<number>;
}) {
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const helmet = useRef<THREE.Group>(null!);
  const visorMat = useRef<THREE.MeshStandardMaterial>(null!);
  const current = useRef(0);
  const tuck = useRef(0);

  /**
   * The bike's own anchors, as objects in the tree.
   *
   * They are children of the root group and carry no geometry: their whole
   * job is to be somewhere three can compute a world position for. That is
   * what lets the solve stay correct without composing any matrices by hand —
   * lean, tuck, and the road's shake all land on the shoulder, and the target
   * is read through the same transforms.
   */
  const barL = useRef<THREE.Object3D>(null!);
  const barR = useRef<THREE.Object3D>(null!);
  const pegL = useRef<THREE.Object3D>(null!);
  const pegR = useRef<THREE.Object3D>(null!);

  const upperL = useRef<THREE.Group>(null!);
  const upperR = useRef<THREE.Group>(null!);
  const foreL = useRef<THREE.Group>(null!);
  const foreR = useRef<THREE.Group>(null!);
  const thighL = useRef<THREE.Group>(null!);
  const thighR = useRef<THREE.Group>(null!);
  const shinL = useRef<THREE.Group>(null!);
  const shinR = useRef<THREE.Group>(null!);

  useFrame((state, dt) => {
    if (!lean.current || !torso.current) return;
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

    // Fold down over the tank as the speed comes up. This is the whole
    // difference between a figure sitting on a bike and a figure riding one:
    // the pose at 5 units/s and the pose at 20 should not be the same pose.
    torso.current.rotation.x = TORSO_PITCH + folded * TUCK;

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

    // ── Then put the hands and feet back where the bike is ─────────────────
    //
    // Everything above moved the body. `worldToLocal` reads its own
    // `matrixWorld`, which R3F will not refresh until it renders — after this
    // callback — so the two frames have to be brought up to date here or the
    // solve runs against where the rider was last frame. One update each,
    // parents included; the anchors refresh themselves inside
    // `getWorldPosition`.
    torso.current.updateWorldMatrix(true, false);
    lean.current.updateWorldMatrix(true, false);

    if (barL.current && upperL.current && foreL.current) {
      barL.current.getWorldPosition(_target);
      torso.current.worldToLocal(_target);
      solveArm(upperL.current, foreL.current, _shoulderL, _target, UPPER, FORE, ELBOW_POLE_L);
    }
    if (barR.current && upperR.current && foreR.current) {
      barR.current.getWorldPosition(_target);
      torso.current.worldToLocal(_target);
      solveArm(upperR.current, foreR.current, _shoulderR, _target, UPPER, FORE, ELBOW_POLE_R);
    }
    if (pegL.current && thighL.current && shinL.current) {
      pegL.current.getWorldPosition(_target);
      lean.current.worldToLocal(_target);
      solveArm(thighL.current, shinL.current, _hipL, _target, THIGH, SHIN, KNEE_POLE);
    }
    if (pegR.current && thighR.current && shinR.current) {
      pegR.current.getWorldPosition(_target);
      lean.current.worldToLocal(_target);
      solveArm(thighR.current, shinR.current, _hipR, _target, THIGH, SHIN, KNEE_POLE);
    }

    if (visorMat.current) {
      visorMat.current.emissiveIntensity =
        1.7 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
    }
  });

  const suit = solid(design.shell, FINISH.suit[0], FINISH.suit[1]);
  const shell = solid(design.shell, FINISH.helmet[0], FINISH.helmet[1]);
  const limb = solid(design.limb, FINISH.limb[0], FINISH.limb[1]);
  const boot = solid(design.boot, FINISH.boot[0], FINISH.boot[1]);
  const trim = solid(design.trim, FINISH.trim[0], FINISH.trim[1]);
  const glove = solid(design.boot, FINISH.glove[0], FINISH.glove[1]);

  return (
    <group ref={root} position={[0, ROOT_Y, ROOT_Z]}>
      {/*
        The bike's grips and pegs, in the rider's own root space. They carry
        no geometry — the bike draws those — and exist so the solve has
        something to ask three for a world position of. Expressed as BARS and
        PEGS minus this group's own offset, so moving the rider on the seat
        cannot desynchronise them from the bike.
      */}
      <object3D ref={barL} position={[-GRIP_X, BARS.y - ROOT_Y, BARS.z - ROOT_Z]} />
      <object3D ref={barR} position={[GRIP_X, BARS.y - ROOT_Y, BARS.z - ROOT_Z]} />
      <object3D ref={pegL} position={[-PEGS.x, PEGS.y - ROOT_Y, PEGS.z - ROOT_Z]} />
      <object3D ref={pegR} position={[PEGS.x, PEGS.y - ROOT_Y, PEGS.z - ROOT_Z]} />

      {/* Roll axis runs along the bike, so the lean pivots about the saddle
          rather than about the rider's own middle. */}
      <group ref={lean}>
        {/* ── Torso, tipped forward over the tank ── */}
        <group ref={torso} rotation={[TORSO_PITCH, 0, 0]}>
          <mesh geometry={G.chest} material={suit} position={[0, 0.07, 0.01]} castShadow />
          <mesh geometry={G.belly} material={suit} position={[0, -0.13, 0]} castShadow />
          <mesh geometry={G.belt} material={trim} position={[0, -0.21, 0]} />
          <mesh geometry={G.core} position={[0, 0.09, 0.15]}>
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>

          {/* A block on the back, for the designs that carry one. */}
          {design.pack && (
            <mesh geometry={G.pack} material={trim} position={[0, 0.02, -0.18]} />
          )}

          {/* ── Helmet ── */}
          <group ref={helmet} position={[0, 0.3, 0.04]} rotation={[HELMET_PITCH, 0, 0]}>
            <mesh geometry={G.head} material={shell} castShadow />
            {/* Visor on +Z: the rider faces the way the bike points. Untextured
                — a weave on a visor is a scratched visor. */}
            <mesh geometry={G.visor} position={[0, -0.02, 0.17]}>
              <meshStandardMaterial
                ref={visorMat}
                color="#0b1024"
                emissive={color}
                emissiveIntensity={1.7}
                toneMapped={false}
              />
            </mesh>
            <Crest design={design} />
          </group>

          {/* ── Arms ──
              Two bones each, solved onto the grips every frame. The meshes sit
              at half a segment down their own group, so a group's origin is
              the joint and the solver only ever writes quaternions. */}
          {(
            [
              [-1, upperL, foreL] as const,
              [1, upperR, foreR] as const,
            ] as const
          ).map(([side, up, fo]) => (
            <group key={side} ref={up} position={[side * SHOULDER.x, SHOULDER.y, SHOULDER.z]}>
              {design.pauldrons && (
                <mesh
                  geometry={G.pauldron}
                  material={trim}
                  position={[side * 0.03, 0.02, 0]}
                />
              )}
              <mesh geometry={G.upper} material={limb} position={[0, -UPPER / 2, 0]} castShadow />
              <group ref={fo} position={[0, -UPPER, 0]}>
                <mesh geometry={G.fore} material={limb} position={[0, -FORE / 2, 0]} castShadow />
                {/* The hand, on the grip. This is the whole point of the file. */}
                <mesh geometry={G.glove} material={glove} position={[0, -FORE, 0]} />
              </group>
            </group>
          ))}
        </group>

        {/* ── Legs ──
            Outside the torso, because a rider's hips do not fold with their
            chest. Solved onto the pegs by the same routine as the arms. */}
        {(
          [
            [-1, thighL, shinL] as const,
            [1, thighR, shinR] as const,
          ] as const
        ).map(([side, th, sh]) => (
          <group key={side} ref={th} position={[side * HIP.x, HIP.y, HIP.z]}>
            <mesh geometry={G.thigh} material={boot} position={[0, -THIGH / 2, 0]} castShadow />
            <group ref={sh} position={[0, -THIGH, 0]}>
              <mesh geometry={G.shin} material={boot} position={[0, -SHIN / 2, 0]} castShadow />
              <mesh geometry={G.boot} material={boot} position={[0, -SHIN, 0.04]} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Whoever this player is riding as.
 *
 * The one place that decides between the two kinds of rider, so neither
 * `Bike` nor `RaceRiders` has to know there are two — the same shape `Avatar`
 * has for the on-foot case, and for the same reasons.
 *
 * The fallback is the voxel courier and that is not an accident: a GLB is a
 * download, and suspending on it with nothing underneath would leave a
 * riderless bike going round the track for as long as that took. Both are
 * fitted to `SADDLE`, so a character popping in mid-race does not move.
 */
export function Rider({
  color = "#22d3ee",
  characterId = DEFAULT_CHARACTER,
  steerRef,
  speedRef,
}: {
  color?: string;
  /** A `lib/characters.ts` id. The courier has no GLB and is drawn directly. */
  characterId?: string;
  steerRef?: React.RefObject<number>;
  speedRef?: React.RefObject<number>;
}) {
  const voxel = (
    <VoxelRider
      color={color}
      design={designFor(characterId)}
      steerRef={steerRef}
      speedRef={speedRef}
    />
  );
  if (!characterFor(characterId).url) return voxel;

  return (
    <Suspense fallback={voxel}>
      <RiderRig characterId={characterId} steerRef={steerRef} speedRef={speedRef} />
    </Suspense>
  );
}
