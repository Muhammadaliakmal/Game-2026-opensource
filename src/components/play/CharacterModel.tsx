"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";
import { look } from "./camera-rig";

/**
 * The player avatar: a small voxel courier with a lit visor.
 *
 * Built from primitives rather than a GLB so it costs no asset pipeline (that
 * arrives in Phase 3) and stays fully procedural — every joint is driven from
 * the live EcctrlHandle, so the animation always matches the physics rather
 * than being a clip that drifts out of sync.
 *
 * The model is cosmetic only; nothing here touches physics. But it has to be
 * planted on the same ground the collider is standing on, or the character
 * reads as hovering — see GROUND_OFFSET.
 */

// Geometry is shared across every instance — one allocation per shape, ever.
const G = {
  head: new RoundedBoxGeometry(0.44, 0.36, 0.4, 3, 0.07),
  visor: new RoundedBoxGeometry(0.34, 0.13, 0.06, 2, 0.03),
  torso: new RoundedBoxGeometry(0.4, 0.44, 0.3, 3, 0.08),
  limb: new RoundedBoxGeometry(0.12, 0.3, 0.13, 2, 0.045),
  core: new THREE.SphereGeometry(0.055, 12, 12),
  antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6),
};

/**
 * The model is built facing its own local -Z, and then the whole thing is
 * turned around by MODEL_FACING (below) so that it faces +Z in the space its
 * parent gives it.
 *
 * That is not decoration, it is the contract with the physics: ecctrl's
 * `turnCharacter` rotates the rigid body until its local **+Z** points along
 * the direction of travel (`characterZAxis` starts life as `(0, 0, 1)`). The
 * avatar used to be dropped in facing -Z, so it ran, jumped and landed with
 * the back of its head pointed at wherever it was going — visibly backwards in
 * third person, and the reason the character looked wrong when steered with a
 * thumbstick.
 *
 * Everything inside the flip stays in the original -Z space, so the forward
 * lean and the gait keep their signs and stay consistent with the face.
 */
const MODEL_FACING = Math.PI;

const SWING = 0.85; // radians at full sprint
const LEAN = 0.22;

/**
 * How square-on to the facing a step has to be before it is allowed to decide
 * which way the legs cycle. cos(75 deg) — so running forward or backing up
 * flips the stride, while a pure sideways strafe leaves it alone rather than
 * chattering between the two every frame as the dot product crosses zero.
 */
const STRIDE_COMMIT = 0.25;

/**
 * Drops the model so its soles meet the floor.
 *
 * ecctrl holds the capsule on a spring a `floatHeight` gap above the ground,
 * so the contact point is not the body origin: it's
 * `-(capsuleHalfHeight + capsuleRadius + floatHeight)` = -(0.3 + 0.3 + 0.2).
 * The limbs bottom out at -0.54 in model space, so without this the character
 * renders a quarter of a unit in the air.
 *
 * These must stay in step with the <Ecctrl> props in Player.tsx.
 */
const CONTACT_Y = -(0.3 + 0.3 + 0.2);
const SOLE_Y = -0.54;
const GROUND_OFFSET = CONTACT_Y - SOLE_Y;

/**
 * The three numbers the animation actually needs. EcctrlHandle satisfies this
 * structurally, so the local player passes its handle unchanged — and a remote
 * peer, who has no physics at all, can supply the same three derived from
 * interpolated positions (see lib/net/peers.ts).
 */
export interface AvatarMotion {
  moveSpeed: number;
  isOnGround: boolean;
  verticalSpeed: number;
}

export function CharacterModel({
  handleRef,
  motionRef,
  /** Peers must not vanish because OUR camera is close to OUR own avatar. */
  hideUpClose = true,
}: {
  handleRef?: RefObject<EcctrlHandle | null>;
  motionRef?: RefObject<AvatarMotion | null>;
  hideUpClose?: boolean;
}) {
  const outer = useRef<THREE.Group>(null!); // ground plant + facing flip
  const root = useRef<THREE.Group>(null!); // squash / lean
  const rig = useRef<THREE.Group>(null!); // bob
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const visorMat = useRef<THREE.MeshStandardMaterial>(null!);

  // Gait phase and landing-squash amount, kept in a ref so no frame re-renders.
  // `stride` is +1 running forward and -1 backing up; see the stride block.
  const anim = useRef({ phase: 0, squash: 0, wasOnGround: true, stride: 1 });

  // Scratch for the stride test, mutated in place each frame like the rest of
  // this component: it runs at 60Hz and fresh vectors would be pure garbage.
  const travel = useRef({
    prev: new THREE.Vector3(),
    primed: false,
    here: new THREE.Vector3(),
    step: new THREE.Vector3(),
    face: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
  });

  useFrame((state, dt) => {
    const h = handleRef?.current ?? motionRef?.current;
    if (!h || !root.current) return;
    const a = anim.current;
    const t = state.clock.elapsedTime;

    // Hide once the eye is inside the model. Keyed off the rig's live distance
    // rather than the first-person flag so it disappears partway through the
    // transition instead of popping at either end of it.
    if (hideUpClose) {
      root.current.visible = look.distance > 1.8;
      if (!root.current.visible) return;
    }

    const speed = h.moveSpeed;
    const gait = Math.min(1, speed / FEEL.runSpeed); // 0..1 blend

    // ── Landing squash (impact-scaled, so a hop barely registers) ──────────
    if (h.isOnGround && !a.wasOnGround) {
      a.squash = Math.min(1, Math.abs(h.verticalSpeed) / FEEL.hardLandVel);
    }
    a.wasOnGround = h.isOnGround;
    a.squash = Math.max(0, a.squash - dt / FEEL.squashRecover);

    const s = a.squash;
    root.current.scale.set(
      1 + (FEEL.squashScale[0] - 1) * s,
      1 + (FEEL.squashScale[1] - 1) * s,
      1 + (FEEL.squashScale[2] - 1) * s
    );
    // Lean into the run — a body that stays bolt upright reads as sliding.
    root.current.rotation.x = -LEAN * gait;

    // ── Stride direction ───────────────────────────────────────────────────
    /**
     * Which way round the legs cycle.
     *
     * `moveSpeed` is a magnitude, so on its own it cannot tell running from
     * backing up — the phase always advanced forwards and the character
     * moonwalked. That never showed while the body turned to face its own
     * direction of travel, because then there was no such thing as backwards.
     * Shift lock-on introduced one: the body holds the camera's heading while
     * you strafe and reverse around it, and the limbs kept swinging as though
     * you were running the other way.
     *
     * Measured from the avatar's own world transform rather than from a
     * velocity handed in, because that is the one source both kinds of avatar
     * have. A peer carries position and yaw and no signed velocity at all (see
     * lib/net/peers.ts), and this reads correctly for it for free.
     */
    const tr = travel.current;
    outer.current.getWorldPosition(tr.here);
    if (!tr.primed) {
      tr.prev.copy(tr.here);
      tr.primed = true;
    }
    tr.step.subVectors(tr.here, tr.prev).setY(0);
    tr.prev.copy(tr.here);

    const stepLen = tr.step.length();
    if (stepLen > 1e-4) {
      // The face is the model's local -Z carried through MODEL_FACING and
      // whatever the body is doing above it.
      outer.current.getWorldQuaternion(tr.quat);
      tr.face.set(0, 0, -1).applyQuaternion(tr.quat).setY(0).normalize();
      // Normalised, so the test is an angle and not a speed — otherwise it
      // would behave differently at 30fps and at 144.
      const along = tr.step.dot(tr.face) / stepLen;
      if (along > STRIDE_COMMIT) a.stride = 1;
      else if (along < -STRIDE_COMMIT) a.stride = -1;
    }

    // ── Gait ───────────────────────────────────────────────────────────────
    // Phase advances with distance travelled, not time, so the legs can't
    // cycle while standing still and stride rate matches walk vs run for free.
    a.phase += speed * dt * 3.4 * a.stride;
    const swing = Math.sin(a.phase) * SWING * gait;

    if (h.isOnGround) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
      armL.current.rotation.x = -swing * 0.8;
      armR.current.rotation.x = swing * 0.8;
      // Bob on the off-beat of the stride, plus a slow idle breath.
      rig.current.position.y =
        Math.abs(Math.sin(a.phase)) * 0.035 * gait + Math.sin(t * 1.6) * 0.012;
    } else {
      // Airborne: tuck the legs and throw the arms up. Lerped so the pose
      // eases in rather than snapping the instant the feet leave the ground.
      const k = 1 - Math.pow(0.001, dt);
      const rising = h.verticalSpeed > 0;
      legL.current.rotation.x = THREE.MathUtils.lerp(
        legL.current.rotation.x, rising ? -0.7 : -0.25, k);
      legR.current.rotation.x = THREE.MathUtils.lerp(
        legR.current.rotation.x, rising ? -0.35 : 0.3, k);
      armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -2.2, k);
      armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -2.0, k);
      rig.current.position.y = THREE.MathUtils.lerp(rig.current.position.y, 0.04, k);
    }

    // Head counter-rotates slightly against the lean, so it stays level-ish.
    head.current.rotation.x = LEAN * gait * 0.6;

    // Visor pulses faster the harder you're moving — cheap "alive" signal.
    if (visorMat.current) {
      visorMat.current.emissiveIntensity =
        1.6 + Math.sin(t * (3 + gait * 6)) * 0.35 + gait * 0.6;
    }
  });

  return (
    // Static plant on the floor, and the half-turn that puts the visor on the
    // engine's forward axis; `root` stays free for squash and lean so those
    // still scale and pivot about the body rather than the feet.
    <group
      ref={outer}
      position={[0, GROUND_OFFSET, 0]}
      rotation={[0, MODEL_FACING, 0]}
    >
      <group ref={root}>
        <group ref={rig}>
          {/* ── Torso ── */}
          <mesh geometry={G.torso} position={[0, -0.02, 0]} castShadow>
            <meshStandardMaterial color="#4f46e5" roughness={0.42} metalness={0.25} />
          </mesh>
          {/* Chest core */}
          <mesh geometry={G.core} position={[0, 0.02, -0.15]}>
            <meshStandardMaterial
              color="#22d3ee"
              emissive="#22d3ee"
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>

          {/* ── Head ── */}
          <group ref={head} position={[0, 0.42, 0]}>
            <mesh geometry={G.head} castShadow>
              <meshStandardMaterial color="#e8ecff" roughness={0.35} metalness={0.1} />
            </mesh>
            {/* Visor reads as the "face", so forward direction is unmistakable.
                Local -Z, which MODEL_FACING turns into world forward. */}
            <mesh geometry={G.visor} position={[0, 0.01, -0.19]}>
              <meshStandardMaterial
                ref={visorMat}
                color="#0b1024"
                emissive="#22d3ee"
                emissiveIntensity={1.8}
                toneMapped={false}
              />
            </mesh>
            <mesh geometry={G.antenna} position={[0.13, 0.26, 0]} rotation={[0, 0, -0.25]}>
              <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.8} />
            </mesh>
            <mesh geometry={G.core} position={[0.155, 0.36, 0]} scale={0.62}>
              <meshStandardMaterial
                color="#a3e635"
                emissive="#a3e635"
                emissiveIntensity={2.6}
                toneMapped={false}
              />
            </mesh>
          </group>

          {/* ── Arms — pivot at the shoulder, so rotation.x swings properly ── */}
          <group ref={armL} position={[-0.26, 0.14, 0]}>
            <mesh geometry={G.limb} position={[0, -0.15, 0]} castShadow>
              <meshStandardMaterial color="#7c3aed" roughness={0.45} metalness={0.2} />
            </mesh>
          </group>
          <group ref={armR} position={[0.26, 0.14, 0]}>
            <mesh geometry={G.limb} position={[0, -0.15, 0]} castShadow>
              <meshStandardMaterial color="#7c3aed" roughness={0.45} metalness={0.2} />
            </mesh>
          </group>

          {/* ── Legs — pivot at the hip ── */}
          <group ref={legL} position={[-0.1, -0.24, 0]}>
            <mesh geometry={G.limb} position={[0, -0.15, 0]} castShadow>
              <meshStandardMaterial color="#312e81" roughness={0.5} metalness={0.2} />
            </mesh>
          </group>
          <group ref={legR} position={[0.1, -0.24, 0]}>
            <mesh geometry={G.limb} position={[0, -0.15, 0]} castShadow>
              <meshStandardMaterial color="#312e81" roughness={0.5} metalness={0.2} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
