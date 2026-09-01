"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useKeyboardControls } from "@react-three/drei";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useJoystickStore } from "ecctrl/input";
import { FEEL } from "@/lib/feel";
import type { Vec3 } from "@/lib/worlddoc";
import { useJumpFeel } from "./feel/useJumpFeel";
import { useFootstepAudio } from "./feel/useFootstepAudio";
import { JumpParticles } from "./feel/JumpParticles";
import { CharacterModel } from "./CharacterModel";
import { touchInput, useRunStore } from "./touch-input";
import { consumeRespawn, notifyRespawned } from "./play-actions";
import {
  applyLook,
  cameraHandoff,
  look,
  playerFocus,
  THIRD_PERSON_DISTANCE,
  useViewStore,
} from "./camera-rig";

/**
 * Drag-to-look, for mouse and touch through the same code path.
 *
 * Listeners sit on the WebGL canvas itself, so the touch overlays (thumbstick,
 * JUMP/RUN) naturally win any pointer that starts on them — which gives the
 * standard mobile layout for free: left thumb drives, right thumb looks,
 * anywhere that isn't a control is look area.
 *
 * Only the pointer that began the drag is tracked, so a second finger on the
 * stick can't yank the camera. Deltas come from clientX/Y rather than
 * movementX/Y because movement* is always 0 for touch pointers.
 *
 * `touch-action: none` on the canvas is set in globals.css — without it the
 * browser claims the gesture for scroll/zoom before we ever see a pointermove.
 */
function useLookControls() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;

    let activeId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      applyLook(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);
}

/**
 * Orbiting follow camera with a first-person mode.
 *
 * ecctrl v2 ships no camera, so this is ours: the eye orbits the character on
 * a yaw/pitch sphere whose radius collapses to zero for first person. One rig
 * covers both views, which means the transition can be a distance lerp instead
 * of a cut — and, more importantly, movement direction stays consistent across
 * the switch because ecctrl reads the same camera either way.
 *
 * Camera lag and velocity lookahead (both straight from the game-feel
 * literature) apply in third person only; in first person a lagging eye is
 * just nausea.
 *
 * The eye also collides with the world. A follow camera on a fixed radius
 * spends half its time inside terrain the moment the player backs against a
 * wall or walks under an overhang — you end up looking at the inside of a
 * block, or straight through the level. A ray from the character to where the
 * camera wants to be finds the first solid thing in the way and the eye stops
 * short of it.
 */

/** Never let the eye get closer than this, or it ends up inside the avatar. */
const CAMERA_MIN_DISTANCE = 0.55;
/** Stop short of the surface: sitting exactly on it still clips the near plane. */
const CAMERA_PAD = 0.32;
function useCameraRig(handleRef: React.RefObject<EcctrlHandle | null>) {
  const camera = useThree((s) => s.camera);
  const firstPerson = useViewStore((s) => s.firstPerson);
  const { world, rapier } = useRapier();

  // Held in a ref and mutated per frame, like every other scratch object in
  // this rig: the loop runs every frame, and a fresh Ray each time would be
  // pure garbage for the collector.
  const ray = useRef(
    new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
  );
  /** The distance actually used, after the world has had its say. */
  const camDist = useRef(THIRD_PERSON_DISTANCE);

  const target = useRef(new THREE.Vector3());
  const lookahead = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());
  const shake = useRef({ time: 0, amp: 0 });
  const wasOnGround = useRef(true);
  const dist = useRef(THIRD_PERSON_DISTANCE);

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // currPos mutates in place, so read components rather than storing the ref.
    const pos = h.currPos;
    playerFocus.set(pos.x, pos.y, pos.z);

    // Take over from wherever the editor camera was looking, once.
    if (cameraHandoff.pending) {
      cameraHandoff.pending = false;
      target.current.copy(cameraHandoff.from);
      dist.current = cameraHandoff.distance;
      camDist.current = cameraHandoff.distance;
    }

    if (firstPerson) {
      lookahead.current.set(0, 0, 0);
    } else {
      lookahead.current.lerp(
        offset.current
          .set(h.currLinVel.x, 0, h.currLinVel.z)
          .multiplyScalar(FEEL.camLookahead),
        0.1
      );
    }

    // Eye height: roughly head level in first person, chest-ish in third.
    desired.current.set(
      pos.x + lookahead.current.x,
      pos.y + (firstPerson ? 0.45 : 1.1),
      pos.z + lookahead.current.z
    );
    // Frame-rate independent lerp: without the dt scaling, camera lag would
    // change character between a 60Hz and a 144Hz display. First person snaps.
    const follow = firstPerson ? 1 : 1 - Math.pow(1 - FEEL.camLag, dt * 60);
    target.current.lerp(desired.current, follow);

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

    // Ease the radius so toggling views glides instead of cutting.
    dist.current = THREE.MathUtils.lerp(
      dist.current,
      firstPerson ? 0 : THIRD_PERSON_DISTANCE,
      1 - Math.pow(0.0001, dt)
    );

    // Unit vector from the character toward the eye.
    const cp = Math.cos(look.pitch);
    offset.current.set(
      Math.sin(look.yaw) * cp,
      Math.sin(look.pitch),
      Math.cos(look.yaw) * cp
    );

    // How far back the world will actually allow the eye to sit.
    const wantDist = dist.current;
    let allowed = wantDist;
    if (wantDist > CAMERA_MIN_DISTANCE) {
      const r = ray.current;
      r.origin.x = target.current.x;
      r.origin.y = target.current.y;
      r.origin.z = target.current.z;
      r.dir.x = offset.current.x;
      r.dir.y = offset.current.y;
      r.dir.z = offset.current.z;

      // Exclude the character's own body, or the ray hits the capsule it
      // started inside and the camera slams to the minimum every frame.
      const hit = world.castRay(
        r,
        wantDist + CAMERA_PAD,
        true,
        undefined,
        undefined,
        undefined,
        h.body
      );
      if (hit) {
        allowed = Math.max(
          CAMERA_MIN_DISTANCE,
          hit.timeOfImpact - CAMERA_PAD
        );
      }
    }

    // Pull IN instantly — a camera that eases into a wall is a camera that
    // spends a few frames inside it — but ease back OUT, because snapping the
    // view outward the moment a corner clears reads as a lurch.
    camDist.current =
      allowed < camDist.current
        ? allowed
        : Math.min(
            allowed,
            THREE.MathUtils.lerp(camDist.current, wantDist, 1 - Math.pow(0.01, dt))
          );

    // The avatar hides itself off this, so it disappears when the eye is
    // pushed inside it rather than filling the screen.
    look.distance = camDist.current;

    camera.position.set(
      target.current.x + offset.current.x * camDist.current + ox,
      target.current.y + offset.current.y * camDist.current + oy,
      target.current.z + offset.current.z * camDist.current
    );
    // Looking back down the offset keeps the aim identical in both modes, so
    // ecctrl's camera-derived forward vector doesn't jump on toggle.
    camera.lookAt(
      camera.position.x - offset.current.x,
      camera.position.y - offset.current.y,
      camera.position.z - offset.current.z
    );
  });
}

export function Player({ spawn }: { spawn: Vec3 }) {
  const ref = useRef<EcctrlHandle>(null);
  const [, getKeys] = useKeyboardControls();
  const prevJump = useRef(false);

  // Space or the on-screen JUMP button — both feed the same forgiveness layer,
  // so coyote time / buffering / variable height work identically on touch.
  const jumpDown = () => Boolean(getKeys().jump) || touchInput.jump;

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
    // The on-screen thumbstick writes to ecctrl's joystick store, which
    // <Ecctrl> also doesn't read on its own — so it gets forwarded here too.
    // Keyboard and touch are additive, never exclusive.
    const stick = useJoystickStore.getState().joysticks.default;
    h.setMovement({
      forward: !!k.forward,
      backward: !!k.backward,
      leftward: !!k.leftward,
      rightward: !!k.rightward,
      // Shift is hold-to-run; the touch RUN button is a latch you tap once.
      run: Boolean(k.run) || useRunStore.getState().running,
      joystick: { x: stick?.x ?? 0, y: stick?.y ?? 0 },
    });
  });

  useJumpFeel(ref, jumpHeld, jumpPressedEdge);
  useCameraRig(ref);
  useLookControls();
  useFootstepAudio(ref);

  // Respawn on falling out of the world, or on demand. Near-instant by design:
  // when failure costs almost nothing, players keep trying instead of quitting.
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
        notifyRespawned();
      }
      return;
    }

    // A manual respawn is immediate — the delay exists to let a fall read as a
    // failure, and someone who asked to reset has already accepted that.
    if (consumeRespawn()) {
      respawnTimer.current = Number.EPSILON;
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
        // The capsule rides a spring at floatHeight above the ground. dampingC
        // was ecctrl's default 6 — underdamped for this capsule mass, so every
        // landing overshot and the character bobbed in place before settling.
        // Raised toward critical damping to kill that bounce while staying
        // responsive on slopes and steps.
        springK={80}
        dampingC={11}
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
