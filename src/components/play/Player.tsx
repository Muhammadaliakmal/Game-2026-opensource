"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useButtonStore, useJoystickStore } from "ecctrl/input";
import { FEEL } from "@/lib/feel";
import type { Vec3 } from "@/lib/worlddoc";
import { useJumpFeel } from "./feel/useJumpFeel";
import { useFootstepAudio } from "./feel/useFootstepAudio";
import { JumpParticles } from "./feel/JumpParticles";

/**
 * Third-person follow camera.
 *
 * ecctrl v2 removed the built-in follow cam, so the camera is driven here:
 * lerp toward the character with a deliberate lag, plus velocity-based
 * lookahead so the view leads the direction of travel. Both come straight from
 * the game-feel literature — a camera welded rigidly to the player feels dead.
 */
function useFollowCamera(handleRef: React.RefObject<EcctrlHandle | null>) {
  const camera = useThree((s) => s.camera);
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const lookahead = useRef(new THREE.Vector3());
  const shake = useRef({ time: 0, amp: 0 });
  const wasOnGround = useRef(true);

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // currPos mutates in place, so read components rather than storing the ref.
    const pos = h.currPos;

    lookahead.current.lerp(
      new THREE.Vector3(h.currLinVel.x, 0, h.currLinVel.z).multiplyScalar(
        FEEL.camLookahead
      ),
      0.1
    );

    const desired = new THREE.Vector3(
      pos.x + lookahead.current.x,
      pos.y + 1.2,
      pos.z + lookahead.current.z
    );
    // Frame-rate independent lerp: without the dt scaling, camera lag would
    // change character between a 60Hz and a 144Hz display.
    target.current.lerp(desired, 1 - Math.pow(1 - FEEL.camLag, dt * 60));

    // Screen shake on a hard landing.
    const landedHard =
      h.isOnGround &&
      !wasOnGround.current &&
      Math.abs(h.verticalSpeed) > FEEL.hardLandVel;
    if (landedHard) {
      shake.current.time = FEEL.shakeDur;
      shake.current.amp = FEEL.shakeAmp;
    }
    wasOnGround.current = h.isOnGround;

    let ox = 0;
    let oy = 0;
    if (shake.current.time > 0) {
      shake.current.time -= dt;
      const falloff = Math.max(0, shake.current.time / FEEL.shakeDur);
      const t = performance.now() / 1000;
      ox = Math.sin(t * FEEL.shakeFreq) * shake.current.amp * falloff;
      oy = Math.cos(t * FEEL.shakeFreq * 1.3) * shake.current.amp * falloff;
    }

    camera.position.set(
      target.current.x + 8 + ox,
      target.current.y + 6 + oy,
      target.current.z + 8
    );
    camera.lookAt(target.current);
  });
}

/** Simple capsule stand-in for a character model, with landing squash. */
function CharacterModel({
  handleRef,
}: {
  handleRef: React.RefObject<EcctrlHandle | null>;
}) {
  const group = useRef<THREE.Group>(null!);
  const squash = useRef(0);
  const wasOnGround = useRef(true);

  useFrame((_, dt) => {
    const h = handleRef.current;
    const g = group.current;
    if (!h || !g) return;

    if (h.isOnGround && !wasOnGround.current) {
      // Squash scales with impact, so a small hop barely registers.
      squash.current = Math.min(1, Math.abs(h.verticalSpeed) / FEEL.hardLandVel);
    }
    wasOnGround.current = h.isOnGround;

    squash.current = Math.max(0, squash.current - dt / FEEL.squashRecover);
    const t = squash.current;
    g.scale.set(
      1 + (FEEL.squashScale[0] - 1) * t,
      1 + (FEEL.squashScale[1] - 1) * t,
      1 + (FEEL.squashScale[2] - 1) * t
    );
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
        <meshStandardMaterial color="#22d3ee" roughness={0.35} emissive="#22d3ee" emissiveIntensity={0.35} />
      </mesh>
      {/* A nose, so facing direction is readable. */}
      <mesh position={[0, 0.15, -0.3]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color="#0e7490" />
      </mesh>
    </group>
  );
}

export function Player({ spawn }: { spawn: Vec3 }) {
  const ref = useRef<EcctrlHandle>(null);
  const [, getKeys] = useKeyboardControls();
  const prevJump = useRef(false);

  // Space or the on-screen JUMP button — both feed the same forgiveness layer,
  // so coyote time / buffering / variable height work identically on touch.
  const jumpDown = () =>
    Boolean(getKeys().jump) || Boolean(useButtonStore.getState().buttons.jump);

  // Rising-edge detection: distinguishes a fresh press from a held button, so
  // holding jump doesn't retrigger every frame.
  const jumpPressedEdge = () => {
    const now = jumpDown();
    const edge = now && !prevJump.current;
    prevJump.current = now;
    return edge;
  };
  const jumpHeld = () => jumpDown();

  // ecctrl v2 ships no keyboard handling of its own — <KeyboardControls> only
  // fills a store, so the directional keys have to be forwarded to the
  // controller every frame. (useJumpFeel owns the `jump` field separately;
  // setMovement merges per-field, so the two don't collide.)
  useFrame(() => {
    const h = ref.current;
    if (!h) return;
    const k = getKeys();
    // The on-screen thumbstick and RUN button write to ecctrl's own input
    // stores, which <Ecctrl> also doesn't read on its own — so they get
    // forwarded here too. Keyboard and touch are additive, never exclusive.
    const stick = useJoystickStore.getState().joysticks.default;
    const buttons = useButtonStore.getState().buttons;
    h.setMovement({
      forward: !!k.forward,
      backward: !!k.backward,
      leftward: !!k.leftward,
      rightward: !!k.rightward,
      run: Boolean(k.run) || Boolean(buttons.run),
      joystick: { x: stick?.x ?? 0, y: stick?.y ?? 0 },
    });
  });

  useJumpFeel(ref, jumpHeld, jumpPressedEdge);
  useFollowCamera(ref);
  useFootstepAudio(ref);

  // Respawn on falling out of the world. Near-instant by design: when failure
  // costs almost nothing, players keep trying instead of quitting.
  const respawnTimer = useRef(0);
  useFrame((_, dt) => {
    const h = ref.current;
    if (!h) return;

    if (respawnTimer.current > 0) {
      respawnTimer.current -= dt;
      if (respawnTimer.current <= 0) {
        h.body.setTranslation(
          { x: spawn[0], y: spawn[1], z: spawn[2] },
          true
        );
        h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    if (h.currPos.y < FEEL.fallOutY) {
      respawnTimer.current = FEEL.respawnDelay;
    }
  });

  useEffect(() => {
    prevJump.current = false;
  }, []);

  return (
    <>
      <Ecctrl
        ref={ref}
        position={spawn}
        capsuleRadius={0.3}
        capsuleHalfHeight={0.3}
        maxWalkVel={FEEL.walkSpeed}
        maxRunVel={FEEL.runSpeed}
        jumpVel={FEEL.jumpVel}
        airDragFactor={FEEL.airControl}
        fallingGravityScale={FEEL.fallGravityScale}
        fallingMaxVel={FEEL.maxFallSpeed}
        floatHeight={0.2}
        springK={80}
        dampingC={6}
        groundDetection="shapeCast"
        // Hold Shift to run, not tap-to-toggle — platformer convention.
        enableToggleRun={false}
      >
        <CharacterModel handleRef={ref} />
      </Ecctrl>

      {/* World-space, so it sits outside <Ecctrl>'s transform. */}
      <JumpParticles handleRef={ref} />
    </>
  );
}
