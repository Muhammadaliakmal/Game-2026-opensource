"use client";

import * as THREE from "three";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useKeyboardControls } from "@react-three/drei";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useJoystickStore } from "ecctrl/input";
import { FEEL } from "@/lib/feel";
import type { Checkpoint, Vec3 } from "@/lib/worlddoc";
import { resumePose } from "@/lib/checkpoints";
import { useEditorStore } from "@/stores/editor-store";
import { touchingHazard } from "./hazard";
import { sfxHazard } from "@/lib/sfx/parkour";
import { useCoarsePointer, useTouchControls } from "@/lib/use-media-query";
import { useJumpFeel } from "./feel/useJumpFeel";
import { useFootstepAudio } from "./feel/useFootstepAudio";
import { JumpParticles } from "./feel/JumpParticles";
import { OwnAvatar } from "./Avatar";
import { touchInput } from "./touch-input";
import { createStickState, shapeStick } from "./stick";
import { useMoveMode } from "./move-mode";
import { useCourse } from "./course";
import {
  consumeRespawn,
  consumeRestart,
  notifyRespawned,
  requestRespawn,
  requestRestart,
  type RespawnCause,
} from "./play-actions";
import { bound } from "@/lib/keybinds";
import { reducedMotion } from "@/lib/motion";
import { requestHitStop } from "@/lib/hit-stop";
import { sendMove } from "@/lib/net/presence";
import {
  applyLook,
  approachYaw,
  AUTO_FOLLOW_DELAY,
  AUTO_FOLLOW_MIN_SPEED,
  AUTO_FOLLOW_RATE,
  cameraHandoff,
  look,
  playerFocus,
  recenterPitch,
  THIRD_PERSON_DISTANCE,
  useViewStore,
  yawTowards,
} from "./camera-rig";

/**
 * Look controls: pointer lock for a mouse, drag for a finger.
 *
 * A mouse gets the shooter treatment — click the canvas once and the browser
 * hands us the cursor, after which moving the mouse aims the camera with no
 * button held. Esc gives it back. That is the only way to look *and* steer at
 * the same time, which is what the Shift lock-on below is for.
 *
 * Drag-to-look stays underneath it, unchanged, because it is what touch has
 * and because pointer lock can be refused (a headless browser, an iframe
 * without allow="pointer-lock", a user who just pressed Esc — Chrome rate
 * limits re-locking for a second or so afterwards). The two compose safely
 * rather than being an either/or: while the pointer is locked the browser
 * freezes clientX/clientY, so the drag path computes deltas of exactly zero
 * and contributes nothing. Only `movementX/Y` moves the camera.
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
  const setPointerLocked = useViewStore((s) => s.setPointerLocked);
  // Never take the cursor away while the thumb overlays are on screen. On a
  // narrow desktop window both are true at once — a mouse *and* a JUMP button
  // — and a hidden cursor over a button you now cannot aim at is a worse deal
  // than dragging to look.
  const overlaysMounted = useTouchControls();

  useEffect(() => {
    const el = gl.domElement;

    let activeId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const locked = () => document.pointerLockElement === el;

    const onDown = (e: PointerEvent) => {
      // Only a mouse gets captured. Requesting a lock for a finger would take
      // the cursor away on a hybrid laptop the moment someone taps the screen.
      if (e.pointerType === "mouse" && !overlaysMounted && !locked()) {
        // Returns a promise in current Chrome and undefined elsewhere; a
        // refused lock is expected, not exceptional, so it is swallowed and
        // the drag path below just keeps working.
        void Promise.resolve(el.requestPointerLock?.()).catch(() => {});
      }

      if (activeId !== null) return;
      activeId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      // Capture throws if the pointer is already gone (or locked away).
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal — we still get the moves */
      }
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

    // Free look. `mousemove` rather than `pointermove`: movementX/Y is the
    // only field that still means anything once the cursor is pinned.
    const onRawMove = (e: MouseEvent) => {
      if (!locked()) return;
      applyLook(e.movementX, e.movementY);
    };

    const onLockChange = () => {
      setPointerLocked(locked());
      // A drag that was in flight when the lock engaged would otherwise sit
      // there holding a stale pointer id.
      if (locked()) activeId = null;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    document.addEventListener("mousemove", onRawMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      document.removeEventListener("mousemove", onRawMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      // Leaving Play with the cursor still captured strands the player in a
      // world they can no longer click out of.
      if (document.pointerLockElement === el) document.exitPointerLock?.();
      setPointerLocked(false);
    };
  }, [gl, setPointerLocked, overlaysMounted]);
}

/**
 * The keys Play owns, as opposed to the movement map drei fills.
 *
 * These are events, not held directions, so they cannot live in
 * `keyboardMap` — a KeyboardControls entry is a boolean you poll, and polling
 * a toggle re-fires it every frame the key is down.
 *
 * Bound on `window` rather than the canvas so they work before the pointer has
 * ever entered it, and mounted with the Player so they exist in exactly the
 * modes that have a character: Play and Arena, never the editor (where R and V
 * belong to the build tools).
 */
function usePlayHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }

      // Resolved against the player's own bindings rather than fixed codes.
      // `bound()` reads the store outside React, so a rebind takes effect on
      // the next keypress without this listener being rebuilt.
      if (bound("foot", "run", e.code)) {
        // Tap to lock on and sprint, tap again to release both.
        useMoveMode.getState().toggleLockOn();
      } else if (bound("foot", "view", e.code)) {
        useViewStore.getState().toggleFirstPerson();
      } else if (bound("foot", "recenter", e.code)) {
        recenterPitch();
      } else if (bound("foot", "respawn", e.code)) {
        requestRespawn();
      } else if (bound("foot", "restart", e.code)) {
        requestRestart();
      } else {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Never carry sprint or a lock-on into the next world you open.
  useEffect(() => useMoveMode.getState().reset, []);
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

/**
 * ── Creative flight ──────────────────────────────────────────────────────
 *
 * Offered only where the player can edit the world they are in, because that
 * is the only place it is a tool rather than a cheat: you cannot climb the
 * scaffolding of a tower you have not built yet.
 *
 * Double-tap jump is the gesture every block game uses for this, so nobody has
 * to be told it exists — and a player who does not know cannot trip over it,
 * because two jumps in a third of a second is not something you do by accident
 * while playing.
 */
const FLY_DOUBLE_TAP_MS = 320;
/** Vertical speed in flight. Roughly the run speed, so it reads as one pace. */
const FLY_VERTICAL = 5;

/** Never let the eye get closer than this, or it ends up inside the avatar. */
const CAMERA_MIN_DISTANCE = 0.55;
/** Stop short of the surface: sitting exactly on it still clips the near plane. */
const CAMERA_PAD = 0.32;
function useCameraRig(
  handleRef: React.RefObject<EcctrlHandle | null>,
  /** Steer the camera toward the run. Touch only — see the block below. */
  autoFollow: boolean
) {
  const camera = useThree((s) => s.camera);
  const firstPerson = useViewStore((s) => s.firstPerson);
  const lockedOn = useMoveMode((s) => s.lockedOn);
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

    // A hard landing is the one impact an on-foot course produces, so it is
    // where the two whole-screen effects go: a couple of frames of freeze so
    // the landing lands, then a short shake. Both are dropped outright under
    // `prefers-reduced-motion` — see lib/motion.ts on why the squash, the dust
    // and the sound are not.
    const landedHard =
      h.isOnGround &&
      !wasOnGround.current &&
      Math.abs(h.verticalSpeed) > FEEL.hardLandVel;
    if (landedHard && !reducedMotion()) {
      shake.current.time = FEEL.shakeDur;
      shake.current.amp = FEEL.shakeAmp;
      requestHitStop(FEEL.hitStop);
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

    /**
     * Touch: swing the view around to look where the player is running.
     *
     * A thumbstick has no second stick to aim with, so without this the only
     * way to see where you are going is to stop and drag — which is why
     * running sideways on a phone felt like being dragged by the collar. It
     * applies in first person as much as third: there the camera IS the
     * character's head, so "face the way you move" and "look the way you
     * move" are the same requirement.
     *
     * Deliberately not run wherever there is a mouse. There the mouse owns the
     * camera, and a view that creeps while you are trying to hold an angle is
     * a bug — which is why the caller passes `useCoarsePointer`, not the wider
     * predicate that decides whether to mount the thumb controls.
     *
     * Three things switch it off: a thumb currently on the look area (via
     * `manualAt`, for AUTO_FOLLOW_DELAY afterwards), standing still, and
     * lock-on — the whole point of which is to hold a heading the movement
     * does not get a vote on.
     *
     * Direction comes from actual velocity rather than the stick, so it
     * follows where the character really ended up going — into a wall it
     * slides along, off a ledge, down a slope — instead of where it was
     * pushed.
     */
    if (autoFollow && !lockedOn) {
      const vx = h.currLinVel.x;
      const vz = h.currLinVel.z;
      const groundSpeed = Math.hypot(vx, vz);
      if (
        groundSpeed > AUTO_FOLLOW_MIN_SPEED &&
        performance.now() - look.manualAt > AUTO_FOLLOW_DELAY
      ) {
        look.yaw = approachYaw(
          look.yaw,
          yawTowards(vx, vz),
          1 - Math.pow(AUTO_FOLLOW_RATE, dt)
        );
      }
    }

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

export function Player({
  spawn,
  spawnYaw,
  canFly = false,
  checkpoints,
}: {
  spawn: Vec3;
  /** Which way to face on arrival, if the world says. See WorldDoc.spawnYaw. */
  spawnYaw?: number;
  /** Whether creative flight is available here. See FLY_DOUBLE_TAP_MS. */
  canFly?: boolean;
  /** The course's resume points, if it has any. */
  checkpoints?: readonly Checkpoint[];
}) {
  const ref = useRef<EcctrlHandle>(null);

  /**
   * Point the camera down the course before the first frame draws.
   *
   * `look` is module state that survives between worlds, and its initial yaw
   * is a fixed quarter turn chosen years ago to match an orbit camera. Every
   * shipped course runs east from a plaza at the origin, so entering one put
   * the player's back to it: the run began by spinning round to find out where
   * it went. A layout effect rather than a plain one because the rig's own
   * frame subscription is a layout effect too, and the yaw has to be right
   * before the eye is first placed — otherwise the first frame is the wrong
   * view and the rig then eases away from it, which reads as a lurch.
   *
   * A world with no stated facing keeps whatever the rig was holding, which is
   * the old behaviour and the right one for a sandbox with no direction to it.
   */
  useLayoutEffect(() => {
    if (spawnYaw !== undefined) look.yaw = spawnYaw;
    // Deliberately mount-only. Re-running this on a prop change would snatch
    // the camera back mid-run every time the doc reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * Strictly "there is no mouse here", not "the window is narrow".
   *
   * The self-steering camera exists because a thumbstick has no second stick
   * to aim with. A narrow desktop window mounts the thumb controls too, but it
   * still has a mouse — and a camera that creeps while someone is holding an
   * angle with one is a bug, not a convenience. `(pointer: coarse)` reports
   * the PRIMARY pointer, so a touchscreen laptop with a mouse plugged in
   * correctly stays on the desktop side of this.
   */
  const coarsePointer = useCoarsePointer();
  const [, getKeys] = useKeyboardControls();
  const prevJump = useRef(false);

  const flying = useMoveMode((s) => s.flying);
  // The input predicates below are called from the frame loop, outside React,
  // so they read the store directly rather than closing over a render's value.
  // `canFly` is a prop and has no store to read, so it gets a ref — written
  // after the render rather than during it.
  const canFlyRef = useRef(canFly);
  useEffect(() => {
    canFlyRef.current = canFly;
  }, [canFly]);
  const lastJumpAt = useRef(0);

  // Space or the on-screen JUMP button — both feed the same forgiveness layer,
  // so coyote time / buffering / variable height work identically on touch.
  const jumpDown = () => Boolean(getKeys().jump) || touchInput.jump;

  // Rising-edge detection: distinguishes a fresh press from a held button, so
  // holding jump doesn't retrigger every frame.
  const jumpPressedEdge = () => {
    const now = jumpDown();
    const edge = now && !prevJump.current;
    prevJump.current = now;
    if (!edge) return false;

    // The double-tap lives here rather than in a key handler because this is
    // the one place that sees a press from the keyboard AND from the on-screen
    // button, and the gesture has to work on both.
    const at = performance.now();
    const doubled = at - lastJumpAt.current < FLY_DOUBLE_TAP_MS;
    lastJumpAt.current = at;
    if (doubled && canFlyRef.current) {
      useMoveMode.getState().toggleFly();
      // The second tap toggles flight instead of jumping. Doing both would
      // launch the player on the same press that took gravity away.
      return false;
    }
    // In flight, jump is "up" and is applied in the frame loop below.
    return !useMoveMode.getState().flying;
  };
  const jumpHeld = () => !useMoveMode.getState().flying && jumpDown();

  /**
   * Flight is gravity off plus a vertical velocity we own.
   *
   * ecctrl still runs its floating spring underneath, which is why the
   * vertical velocity is written every frame rather than once: the spring can
   * push, and the last writer before the step is the one that decides.
   */
  useEffect(() => {
    const h = ref.current;
    if (!h) return;
    h.body.setGravityScale(flying ? 0 : 1, true);
    if (flying) h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [flying]);

  useFrame(() => {
    const h = ref.current;
    if (!h || !flying) return;
    const k = getKeys();
    // Jump climbs, sprint descends — no new controls, and the pairing is the
    // one every creative mode uses.
    const up = jumpDown() ? 1 : 0;
    const down = Boolean(k.run) || useMoveMode.getState().running ? 1 : 0;
    const v = h.body.linvel();
    h.body.setLinvel({ x: v.x, y: (up - down) * FLY_VERTICAL, z: v.z }, true);
  });

  // ecctrl v2 ships no keyboard handling of its own — <KeyboardControls> only
  // fills a store, so the directional keys have to be forwarded to the
  // controller every frame. (useJumpFeel owns the `jump` field separately;
  // setMovement merges per-field, so the two don't collide.)
  // Mirrored into ecctrl only on change: setLockForward writes a ref, so
  // calling it every frame would be harmless but pointless, and this way the
  // one place the mode is decided is legible.
  const lockedOn = useMoveMode((s) => s.lockedOn);
  useEffect(() => {
    ref.current?.setLockForward(lockedOn);
  }, [lockedOn]);

  // The stick's frame hold and easing — see `stick.ts`. Module-shaped state
  // in a ref, because it is written every frame and nothing renders from it.
  const stickState = useRef(createStickState());
  useFrame((_, dt) => {
    const h = ref.current;
    if (!h) return;
    const k = getKeys();
    // The on-screen thumbstick writes to ecctrl's joystick store, which
    // <Ecctrl> also doesn't read on its own — so it gets forwarded here too.
    // Keyboard and touch are additive, never exclusive.
    //
    // It is shaped first: dead zone, and a heading that is held against the
    // world while the thumb is down rather than re-read against a camera that
    // is itself swinging round to follow the character. "Manual" here is the
    // same window the auto-follow yields to, so a look the player is making
    // turns the thumb with it and the camera's own follow does not.
    const raw = useJoystickStore.getState().joysticks.default;
    const stick = shapeStick(
      { x: raw?.x ?? 0, y: raw?.y ?? 0 },
      look.yaw,
      performance.now() - look.manualAt < AUTO_FOLLOW_DELAY,
      dt,
      stickState.current
    );
    h.setMovement({
      forward: !!k.forward,
      backward: !!k.backward,
      leftward: !!k.leftward,
      rightward: !!k.rightward,
      // Sprint is a latch: Shift arms it together with lock-on, the touch RUN
      // button arms it alone. Holding Shift still runs while it is down, so
      // the old muscle memory is not punished.
      run: Boolean(k.run) || useMoveMode.getState().running,
      joystick: stick,
    });
  });

  useJumpFeel(ref, jumpHeld, jumpPressedEdge);
  useCameraRig(ref, coarsePointer);
  useLookControls();
  usePlayHotkeys();
  useFootstepAudio(ref);

  // Respawn on falling out of the world, on touching a hazard, or on demand.
  // Near-instant by design: when failure costs almost nothing, players keep
  // trying instead of quitting. `cause` is what the timer was started for.
  const respawnTimer = useRef(0);
  const cause = useRef<RespawnCause>("manual");
  useFrame((_, dt) => {
    const h = ref.current;
    if (!h) return;

    // Presence. Throttled inside sendMove to ~12 Hz, and a no-op entirely when
    // no room is connected — which is every session until someone sets
    // NEXT_PUBLIC_MULTIPLAYER_URL. Facing comes from the camera rather than the
    // body: it is where the player is looking, which is what a peer reads.
    sendMove(h.currPos.x, h.currPos.y, h.currPos.z, look.yaw);

    if (respawnTimer.current > 0) {
      respawnTimer.current -= dt;
      if (respawnTimer.current <= 0) {
        // A respawn after the course has been won is a new attempt, whatever
        // asked for it — the R key, the touch button, or walking off the
        // finish tower. Returning to the last checkpoint of a finished run
        // would leave the completion panel up, the clock stopped, and the
        // player standing two thirds of the way along a course they cannot
        // finish again.
        if (useCourse.getState().finishedMs !== null) {
          useCourse.getState().restart();
        }

        // Where the run resumes is the course's decision — the last checkpoint
        // reached, or the spawn if there is none. Read from the store rather
        // than from a prop so a checkpoint banked half a second ago is already
        // the answer.
        const { pos, yaw } = resumePose(
          checkpoints,
          useCourse.getState().checkpoint,
          spawn,
          // Back to the start means back to the start's facing. Keeping the
          // camera's current yaw here is what made a restart drop the runner
          // at the plaza looking at the wall behind it.
          spawnYaw ?? look.yaw
        );
        h.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
        h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        // The facing matters as much as the position: arriving at a checkpoint
        // looking back down the course you just climbed means every attempt
        // starts by spinning round.
        look.yaw = yaw;
        if (cause.current !== "manual") useCourse.getState().died();
        notifyRespawned(cause.current);
      }
      return;
    }

    // A restart is a respawn with the course's progress thrown away first, so
    // the resume pose it reads a moment later resolves to the spawn rather
    // than to the checkpoint being abandoned. Ordering is the whole trick: do
    // it the other way round and the player is teleported to the checkpoint
    // and only then told the run is over.
    if (consumeRestart()) {
      useCourse.getState().restart();
      cause.current = "manual";
      respawnTimer.current = Number.EPSILON;
      return;
    }

    // A manual respawn is immediate — the delay exists to let a fall read as a
    // failure, and someone who asked to reset has already accepted that.
    if (consumeRespawn()) {
      cause.current = "manual";
      respawnTimer.current = Number.EPSILON;
      return;
    }

    if (h.currPos.y < FEEL.fallOutY) {
      // Falling out of the world while flying should not be possible, but a
      // respawn that leaves gravity off would drop the player into a hover at
      // the spawn point and no way to explain it.
      useMoveMode.getState().setFlying(false);
      cause.current = "fall";
      respawnTimer.current = FEEL.respawnDelay;
      return;
    }

    // A hazard block. Same delay as the void, so the death reads as one —
    // the sizzle and the red wash are what say it was the lava and not the
    // edge. Not while flying: the builder's fly-through of their own lava is
    // not a run. Checked last, so a manual respawn this frame wins.
    if (
      !useMoveMode.getState().flying &&
      touchingHazard(useEditorStore.getState().parts, h.currPos.x, h.currPos.y, h.currPos.z)
    ) {
      cause.current = "hazard";
      respawnTimer.current = FEEL.respawnDelay;
      sfxHazard();
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
        // ecctrl's own tap-to-toggle is off: sprint is latched by us instead,
        // in `move-mode`, so Shift and the touch RUN button drive one state.
        enableToggleRun={false}
        // Off at mount; usePlayHotkeys drives it from here on. When it is on,
        // ecctrl turns the body to the camera's forward instead of the
        // direction of travel, which is what makes strafing read as aiming.
        lockForward={false}
      >
        <OwnAvatar handleRef={ref} />
      </Ecctrl>

      {/* World-space, so it sits outside <Ecctrl>'s transform. */}
      <JumpParticles handleRef={ref} />
    </>
  );
}
