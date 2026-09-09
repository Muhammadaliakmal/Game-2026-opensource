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
import { GRID_YAW, beyondRails, onTrack } from "@/lib/race-track";
import { BikeModel, bikeColor } from "./BikeModel";
import { Rider } from "./Rider";
import type { RaceControl } from "./controls";
import { raceTouch } from "./race-touch";
import { boostArmed, raceTelemetry, resetTelemetry } from "./telemetry";
import { CAMERA_MODES, raceCamera, cycleRaceCamera } from "./race-camera";
import { bound } from "@/lib/keybinds";
import { assistSteer } from "@/lib/race-assist";
import { reducedMotion } from "@/lib/motion";
import { requestHitStop } from "@/lib/hit-stop";
import { FEEL } from "@/lib/feel";
import { useShop } from "@/lib/shop";

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
 * ── Boost ────────────────────────────────────────────────────────────────
 *
 * Earned, not granted. The tank fills while drifting and trickles in slowly
 * otherwise, so the fast way round the track is the one that asks something of
 * the rider — which is the whole difference between a racing game and holding
 * a key down. The slow trickle exists so a rider who has not learned to drift
 * yet is never locked out of the verb entirely.
 *
 * Explicitly NOT a wait-or-pay meter (SPEC §1): it refills by playing, it
 * cannot be bought, and running dry costs a few seconds rather than a turn.
 */
const BOOST_TOP_SPEED = 26;
const BOOST_ACCEL = 26;
/** Tank per second while held, so a full tank is a ~1.8 s shove. */
const BOOST_DRAIN = 0.55;
/** Tank per second, always. A full tank from nothing takes ~22 s of riding. */
const BOOST_TRICKLE = 0.045;
/** Tank per second at full lock in a drift — about 2.4 s for a full one. */
const DRIFT_CHARGE_RATE = 0.42;

/**
 * ── Drift ────────────────────────────────────────────────────────────────
 *
 * The bike has no tyre model to lose grip with — velocity is set along the
 * heading every frame, which is what makes it stable. So a drift is the one
 * place the two are allowed to disagree: `heading` (where the bike points)
 * yaws faster, and `course` (where it actually travels) chases the heading
 * instead of matching it. The gap between them IS the slide, and because both
 * are angles integrated from finite numbers, nothing here can diverge.
 */
const DRIFT_MIN_SPEED = 6;
/** Extra yaw authority while sliding — the reason a drift turns tighter. */
const DRIFT_YAW_BONUS = 1.75;
/** Radians per second the course chases the heading while drifting. */
const DRIFT_GRIP = 3.2;
/** And once the drift ends. High enough that the recovery is not a wobble. */
const GRIP_RECOVER = 9;
/** Speed scrubbed per second while sliding. A drift costs something. */
const DRIFT_SCRUB = 2;

/**
 * Ride height. The racing surface tops out at y = 1, and the collider's
 * half-height puts the body origin this far above whatever it rests on.
 */
const HALF_HEIGHT = 0.3;

/** How fast the eye eases toward where the camera wants to be. */
const CAM_LAG = 0.06;

/**
 * Recovery: the race's answer to Play mode's fall-out respawn.
 *
 * Far less likely to be needed now that nothing can tip, but a bike can still
 * be shoved off an edge, and the chase camera is welded to it — so a bike that
 * leaves the world would take the view with it.
 *
 * ── Why height alone was not enough ──────────────────────────────────────
 *
 * This used to be the whole test, and it made the recovery worse than none at
 * a corner. A bike that clears the rail is off the world at track height and
 * only becomes "below" it after a second of falling — a second the chase
 * camera spends pointed into the void. Worse, the safe pose was recorded on
 * any frame above `RECOVER_BELOW_Y + 0.5`, *including those first airborne
 * frames past the rail*. So the pose the rider was sent back to was a point
 * over nothing: they fell, respawned in mid-air where they went off, fell
 * again, and the only way out was the grid. A recovery that returns you to the
 * place you are being recovered from is not a recovery.
 *
 * Both halves are fixed by asking the track, not the altimeter. `beyondRails`
 * is the trigger and `onTrack` gates the memory — see `lib/race-track.ts`.
 */
const RECOVER_BELOW_Y = 0.2;

/**
 * Frames past the rails before the bike believes it has left the world.
 *
 * The same argument as `IMPACT_CONFIRM` below: a single frame at the exact
 * boundary — a wheel clipping the outside of the kerb, the solver resolving a
 * contact a hair wide — is noise, and two consecutive frames are not. It costs
 * about 33 ms of falling, which nobody can see, and buys a recovery that
 * cannot fire on a rider merely running wide.
 */
const OFF_TRACK_CONFIRM = 2;

/**
 * ── Hitting things ───────────────────────────────────────────────────────
 *
 * The bike is driven by `setLinvel` every frame, which is what makes it stable
 * and is also why it never noticed a wall: the solver refused the motion, the
 * position did not change, and `speed` — which is the model, not a measurement
 * — carried on saying 18. The speedometer read 180 kph against a rail, a rider
 * had no way to tell they had stopped except that the scenery was not moving,
 * and the way out was to reverse.
 *
 * So the loop compares where the bike actually got to against where it meant
 * to go, and believes the world. That is the whole fix: a wall now costs
 * speed, the gauge is honest, and a hard one is worth a couple of frames of
 * freeze and a shake.
 */
/** Below this there is no speed worth taking away. */
const IMPACT_MIN_SPEED = 2;
/** Fraction of the intended speed that still counts as having gone somewhere. */
const IMPACT_RATIO = 0.6;
/**
 * Frames of shortfall before the bike believes it.
 *
 * Rapier runs on a fixed 1/60 timestep behind an accumulator, so a render
 * frame that arrives a hair early steps the world zero times and the bike
 * genuinely does not move — through no wall at all. One frame of shortfall is
 * therefore not evidence of anything; two consecutive frames cannot be that,
 * because the accumulator will have caught up by then. It costs about 33ms of
 * latency on a real impact, which is under the frame budget for feedback.
 */
const IMPACT_CONFIRM = 2;
/** Speed lost to one impact that earns the whole-screen treatment. */
const IMPACT_SHAKE_LOSS = 6;

/** Camera shake: how long, and how far, in world units. */
const SHAKE_DUR = 0.16;
const SHAKE_AMP = 0.3;
const SHAKE_FREQ = 34;
/** The kick when a boost lights. Small — it is a shove, not a collision. */
const BOOST_SHAKE_AMP = 0.09;
const BOOST_SHAKE_DUR = 0.12;

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
   * Who the player is riding as.
   *
   * Straight from the shop store, which hydrates synchronously from its cache —
   * so the rider is right on the first frame rather than changing costume once
   * a fetch lands. `OwnAvatar` reads it the same way for the on-foot case; a
   * character bought in the shop should be the one on the bike too, and this is
   * the whole of what that takes.
   */
  const character = useShop((s) => s.character);

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
  /**
   * Direction of travel. Equal to the heading except mid-drift, where it lags
   * behind it — see the drift constants above.
   */
  const course = useRef(GRID_YAW);
  /** Boost in the tank, 0..1, and the charge this drift has not banked yet. */
  const boost = useRef(0);
  const charge = useRef(0);
  const wasDrifting = useRef(false);
  const wasLookingBack = useRef(false);
  const camMode = useRef(raceCamera.mode);

  const quat = useRef(new THREE.Quaternion());
  const eye = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const view = useRef(new THREE.Vector3());
  const primed = useRef(false);
  const safe = useRef<Pose | null>(null);
  const steer = useRef(0);
  /**
   * Last frame's ground position, for the impact test.
   *
   * Null immediately after any teleport: a placement moves the bike further in
   * one frame than any crash ever could, and reading that as an impact would
   * shake the screen every time the grid formed.
   */
  const prevGround = useRef<{ x: number; z: number } | null>(null);
  /** Consecutive frames the bike has failed to go where it was sent. */
  const blockedFor = useRef(0);
  /** Consecutive frames the bike has been past the rails. */
  const offFor = useRef(0);
  const shake = useRef({ time: 0, amp: 0, dur: SHAKE_DUR });
  const wasBoosting = useRef(false);

  /** Put the bike down at a pose, upright and stationary. */
  const place = (b: RapierRigidBody, pose: Pose) => {
    b.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    quat.current.setFromAxisAngle(UP, pose.yaw);
    b.setRotation(quat.current, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    heading.current = pose.yaw;
    course.current = pose.yaw;
    speed.current = 0;
    // A recovered bike keeps its tank — losing it would punish a rider twice
    // for one mistake — but an unbanked drift charge dies with the drift.
    charge.current = 0;
    primed.current = false;
    prevGround.current = null;
    blockedFor.current = 0;
    offFor.current = 0;
  };

  /**
   * The two riding verbs that are events rather than states.
   *
   * They cannot be `KeyboardControls` entries for the reason `lib/keybinds.ts`
   * gives: an entry is a boolean you poll, so polling a toggle re-fires it
   * every frame the key is held. Bound on `window`, and read through `bound()`
   * so a rebind applies without a remount.
   */
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
      if (bound("ride", "cameraCycle", e.code)) {
        camMode.current = cycleRaceCamera();
        primed.current = false; // cut to the new view rather than sweeping to it
      } else if (bound("ride", "respawn", e.code)) {
        const b = body.current;
        const back = safe.current ?? home.current;
        if (b && back) place(b, back);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `place`, `safe` and `home` are refs and stable; nothing here re-binds.
  }, []);

  // A fresh bike starts with an empty tank and a still speedometer, rather
  // than whatever the last race left in the module object.
  useEffect(() => {
    resetTelemetry();
    boost.current = 0;
    charge.current = 0;
  }, []);

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

      // Past the rails is a fall that has not landed yet — the track's own
      // distance field says there is nothing under the bike, whatever its
      // height happens to be this frame. Counted, not believed on sight.
      offFor.current = !lost && beyondRails(t.x, t.z) ? offFor.current + 1 : 0;

      if (lost || t.y < RECOVER_BELOW_Y || offFor.current >= OFF_TRACK_CONFIRM) {
        const back = safe.current ?? home.current;
        if (back) {
          place(b, back);
          view.current.set(back.x, back.y, back.z);
        }
      } else {
        view.current.set(t.x, t.y, t.z);
        // Only a pose on the racing surface is worth returning to. Height was
        // never the question: the frames worth remembering are the ones with
        // track underneath them, and the frames sailing over the barrier at
        // full height are exactly the ones that used to be remembered. Riding
        // the kerb is not recorded either — it is where a rider is about to
        // come off, so sending them back to it would be sending them back to
        // the mistake.
        if (t.y > RECOVER_BELOW_Y + 0.5 && onTrack(t.x, t.z)) {
          safe.current = { x: t.x, y: t.y + 0.1, z: t.z, yaw: heading.current };
        }
      }

      // ── Impact ──────────────────────────────────────────────────────────
      // Measured, not modelled: how far the bike actually travelled since the
      // last frame against how far the motion model asked it to. See the
      // constants above for why the model could not tell on its own.
      const ground = prevGround.current;
      if (ground && step > 0) {
        const actual =
          Math.hypot(view.current.x - ground.x, view.current.z - ground.z) /
          step;
        const intent = Math.abs(speed.current);
        const short = intent > IMPACT_MIN_SPEED && actual < intent * IMPACT_RATIO;
        blockedFor.current = short ? blockedFor.current + 1 : 0;

        if (blockedFor.current >= IMPACT_CONFIRM) {
          const lost = intent - actual;
          // Believe the world. Scrubbing to what happened is what makes a
          // wall cost something and the speedometer tell the truth.
          speed.current = Math.sign(speed.current) * actual;
          // A drift's banked charge does not survive a crash.
          charge.current = 0;
          // Only on the frame the impact is confirmed. A rider holding the
          // throttle into a rail is one crash, not sixty a second.
          if (
            blockedFor.current === IMPACT_CONFIRM &&
            lost > IMPACT_SHAKE_LOSS &&
            !reducedMotion()
          ) {
            requestHitStop(FEEL.hitStop);
            shake.current.time = SHAKE_DUR;
            shake.current.dur = SHAKE_DUR;
            shake.current.amp = SHAKE_AMP;
          }
        }
      }
      prevGround.current = { x: view.current.x, z: view.current.z };

      // ── Input ───────────────────────────────────────────────────────────
      const k = getKeys();
      const stick = useJoystickStore.getState().joysticks.default;
      // Nobody drives before the lights.
      const armed = phase === "racing";
      // Published BEFORE anything reads them back through `boostArmed`, which
      // is the ordering that makes one function serve both sides. The tank is
      // republished at the end of the step with the drain applied — that write
      // is what the meter draws; this one is what the gate reads, and both are
      // this frame's.
      raceTelemetry.riding = armed;
      raceTelemetry.boost = boost.current;

      const throttle = armed && (Boolean(k.forward) || raceTouch.throttle);
      const reverse = armed && (Boolean(k.backward) || raceTouch.reverse);
      const braking = Boolean(k.brake) || raceTouch.brake;

      const keySteer = (k.steerRight ? 1 : 0) - (k.steerLeft ? 1 : 0);
      // Keys win, then the analogue touch schemes (tilt and assist write
      // `raceTouch.steer` directly), then the on-screen stick. Ordered rather
      // than summed: two sources fighting over a wheel is how a bike ends up
      // steering at half lock with the stick hard over.
      const rawSteer =
        keySteer !== 0
          ? keySteer
          : raceTouch.steer !== 0
            ? THREE.MathUtils.clamp(raceTouch.steer, -1, 1)
            : THREE.MathUtils.clamp(stick?.x ?? 0, -1, 1);

      /**
       * Assisted steering, on the touch scheme that asks for it.
       *
       * The rider's input is not blended with the assist, it *displaces* it:
       * the assist gets whatever authority the thumb is not currently using.
       * A rider holding full lock is steering the bike, full stop — an assist
       * that argues with a deliberate input is the thing that makes assisted
       * modes feel like driving through treacle.
       */
      const assisted =
        raceTouch.assist && armed
          ? assistSteer(view.current.x, view.current.z, heading.current)
          : 0;
      const steered =
        rawSteer + assisted * (1 - Math.min(1, Math.abs(rawSteer)));
      steer.current = armed ? THREE.MathUtils.clamp(steered, -1, 1) : 0;

      const lookingBack = Boolean(k.lookBack) || raceTouch.lookBack;
      // A drift needs a direction to slide in and speed to slide with: held
      // with the bike straight and slow it does nothing, which is what stops
      // it becoming a second handbrake.
      const drifting =
        armed &&
        (Boolean(k.drift) || raceTouch.drift) &&
        speed.current > DRIFT_MIN_SPEED &&
        Math.abs(steer.current) > 0.15;
      // The gate, and the only gate. `boostArmed()` reads the same telemetry
      // the BOOST button's fill state is derived from, against the same
      // threshold, so the button cannot say "ready" while this says no — which
      // is the whole of bug #24. `riding` is written above, before this line,
      // so the answer is this frame's rather than last frame's.
      const boosting =
        (Boolean(k.boost) || raceTouch.boost) && boostArmed();

      // A boost with no kick to it is a number going up. One short shake on
      // the rising edge, well under the crash one, so the two are never
      // confused for each other.
      if (boosting && !wasBoosting.current && !reducedMotion()) {
        shake.current.time = BOOST_SHAKE_DUR;
        shake.current.dur = BOOST_SHAKE_DUR;
        shake.current.amp = BOOST_SHAKE_AMP;
      }
      wasBoosting.current = boosting;

      // ── Boost tank ──────────────────────────────────────────────────────
      if (drifting) {
        charge.current = Math.min(
          1,
          charge.current + DRIFT_CHARGE_RATE * Math.abs(steer.current) * step
        );
      } else if (wasDrifting.current) {
        // Banked on release, Mario-Kart style: the reward arrives when the
        // slide is finished and pointing somewhere, not while it is happening.
        boost.current = Math.min(1, boost.current + charge.current);
        charge.current = 0;
      }
      wasDrifting.current = drifting;

      if (boosting) {
        boost.current = Math.max(0, boost.current - BOOST_DRAIN * step);
      } else if (armed) {
        boost.current = Math.min(1, boost.current + BOOST_TRICKLE * step);
      }

      // ── Motion ──────────────────────────────────────────────────────────
      const topSpeed = boosting ? BOOST_TOP_SPEED : MAX_SPEED;
      let v = speed.current;
      if (braking) {
        // Pulls toward zero from whichever side it is on, and stops there
        // rather than reversing straight through it.
        v -= Math.sign(v) * BRAKE_DECEL * step;
        if (Math.abs(v) < BRAKE_DECEL * step) v = 0;
      } else if (boosting) {
        // Boost overrides the throttle rather than requiring it: reaching for
        // a second key to make the first one work is not a skill.
        v = Math.min(BOOST_TOP_SPEED, v + BOOST_ACCEL * step);
      } else if (throttle) {
        // Above the normal top speed — coasting out of a boost — the limiter
        // eases the bike down instead of clamping it, so the shove decays.
        v =
          v > MAX_SPEED
            ? Math.max(MAX_SPEED, v - COAST_DECEL * step)
            : Math.min(MAX_SPEED, v + ACCEL * step);
      } else if (reverse) {
        v = Math.max(-MAX_REVERSE, v - ACCEL * step);
      } else {
        v -= Math.sign(v) * COAST_DECEL * step;
        if (Math.abs(v) < COAST_DECEL * step) v = 0;
      }
      if (drifting) v = Math.max(0, v - DRIFT_SCRUB * step);
      speed.current = Number.isFinite(v) ? v : 0;

      // Steering authority rises with speed, and inverts in reverse — which is
      // what makes backing off a wall behave the way a rider expects.
      const authority = Math.min(1, Math.abs(speed.current) / STEER_FULL_SPEED);
      const yawRate =
        steer.current *
        MAX_YAW_RATE *
        (drifting ? DRIFT_YAW_BONUS : 1) *
        authority *
        (speed.current < 0 ? -1 : 1);
      heading.current -= yawRate * step;

      // The course chases the heading. Slowly mid-drift, which is the slide;
      // fast otherwise, which is a bike that goes where it points. Both use
      // the same frame-rate-independent approach so the slide is the same
      // shape on a 60Hz phone and a 144Hz monitor.
      const grip = drifting ? DRIFT_GRIP : GRIP_RECOVER;
      let delta = heading.current - course.current;
      // Shortest way round: without this, a heading that has wound past ±π
      // sends the course the long way and the bike spins on the spot.
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      course.current += delta * Math.min(1, grip * step);

      // The body is driven, not asked. Rotation is set outright because
      // rotations are locked to yaw, so nothing else is fighting for it.
      quat.current.setFromAxisAngle(UP, heading.current);
      b.setRotation(quat.current, true);

      // X and Z from the COURSE, not the heading — that difference is the
      // whole drift. `fx`/`fz` below stay the heading, because the camera sits
      // behind where the bike is pointing, not behind where it is sliding.
      const cx = Math.sin(course.current);
      const cz = Math.cos(course.current);
      const fx = Math.sin(heading.current);
      const fz = Math.cos(heading.current);
      const linvel = b.linvel();
      b.setLinvel(
        {
          x: cx * speed.current,
          y: Number.isFinite(linvel.y) ? linvel.y : 0,
          z: cz * speed.current,
        },
        true
      );

      // ── Gauges ──────────────────────────────────────────────────────────
      // Written every frame, read by the HUD on its own slower schedule.
      raceTelemetry.speed = speed.current;
      raceTelemetry.topSpeed = topSpeed;
      raceTelemetry.boost = boost.current;
      raceTelemetry.charge = charge.current;
      raceTelemetry.drifting = drifting;
      raceTelemetry.boosting = boosting;

      // ── Presence ────────────────────────────────────────────────────────
      const p = view.current;
      playerFocus.set(p.x, p.y, p.z);
      sendMove(p.x, p.y, p.z, heading.current);

      // ── Chase camera ────────────────────────────────────────────────────
      const cam = CAMERA_MODES[camMode.current];
      // Look-back puts the eye in FRONT of the bike, still aimed at it — so
      // the view down the barrel of the camera is the road you just left,
      // which is what "who is behind me" actually means.
      const back = lookingBack ? -cam.back : cam.back;
      want.current.set(
        p.x - fx * back,
        p.y + cam.height,
        p.z - fz * back
      );

      // A swing through the bike on the way to the other side is nausea, so
      // the flip is a cut in both directions.
      if (lookingBack !== wasLookingBack.current) {
        wasLookingBack.current = lookingBack;
        primed.current = false;
      }

      if (!primed.current) {
        primed.current = true;
        eye.current.copy(want.current);
      } else {
        eye.current.lerp(want.current, 1 - Math.pow(CAM_LAG, step));
      }

      // Shake displaces the eye, never the aim, so the view shudders without
      // the horizon swinging — the same division the on-foot rig uses. It is
      // added on top of `eye` rather than into it, or each frame's wobble
      // would become part of the position the next frame eases from and the
      // camera would drift away from the bike.
      let shakeX = 0;
      let shakeY = 0;
      if (shake.current.time > 0) {
        shake.current.time -= step;
        const falloff = Math.max(0, shake.current.time / shake.current.dur);
        const at = performance.now() / 1000;
        shakeX = Math.sin(at * SHAKE_FREQ) * shake.current.amp * falloff;
        shakeY = Math.cos(at * SHAKE_FREQ * 1.3) * shake.current.amp * falloff;
      }
      camera.position.set(
        eye.current.x + shakeX,
        eye.current.y + shakeY,
        eye.current.z
      );
      camera.lookAt(p.x, p.y + cam.aim, p.z);
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
      <Rider
        color={color}
        characterId={character}
        steerRef={steer}
        speedRef={speed}
      />
    </RigidBody>
  );
}
