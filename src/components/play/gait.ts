import * as THREE from "three";
import { FEEL } from "@/lib/feel";

/**
 * The walk cycle, once, for every avatar that has one.
 *
 * ── Why this is not inside CharacterModel any more ───────────────────────
 *
 * There are two avatars now: the procedural voxel courier, whose limbs are
 * `<group>`s of rounded boxes, and the GLB characters, whose limbs are bones
 * in a skin. They are drawn by completely different code and they must move
 * the same way — a peer who bought a character and a peer who did not are
 * standing next to each other in the same room, and a second copy of "how
 * fast do the legs swing" would drift from the first the day somebody retunes
 * one of them.
 *
 * So the maths lives here and produces ANGLES, and the two renderers only
 * decide what to hang those angles on. Nothing in this file knows about
 * geometry, bones, or three.js objects beyond the one it measures travel from.
 *
 * ── Why the angles are state rather than return values ───────────────────
 *
 * The airborne pose eases in with a lerp, which needs the previous frame's
 * angle. That used to be read back off the `<group>`s themselves, which only
 * worked because nothing else wrote to them. Bones are not that private — a
 * skin's rest pose is on the bone too — so the previous angle is kept here
 * instead, and both renderers become pure consumers.
 */

/**
 * The three numbers the animation actually needs.
 *
 * `EcctrlHandle` satisfies this structurally, so the local player passes its
 * physics handle unchanged; a remote peer has no physics at all and derives
 * the same three from interpolated positions (see lib/net/peers.ts).
 */
export interface AvatarMotion {
  moveSpeed: number;
  isOnGround: boolean;
  verticalSpeed: number;
}

/** Radians of leg swing at full sprint. */
const SWING = 0.85;
/** How far the body tips into a run. */
export const LEAN = 0.22;

/**
 * Peak knee flex at full sprint.
 *
 * A straight leg swinging from the hip is the single thing that made this read
 * as skating rather than running: the foot traces an arc through the floor on
 * the way through, and with nothing folding, a body sliding along at speed is
 * exactly what the eye reports. A knee is also the one joint that cannot be
 * faked symmetrically — it bends one way only, which is why the flex fields
 * below are magnitudes and never signed swings.
 */
const KNEE = 1.15;
/**
 * How far past the leg's furthest-back point the knee peaks, in phase radians.
 *
 * Not zero: the knee folds *after* toe-off, to clear the ground on the way
 * through, and peaks around mid-swing. Folding it in step with the hip instead
 * reads as a limp.
 */
const KNEE_LAG = 0.9;
/** Extra knee flex while a landing is being absorbed. */
const KNEE_LAND = 0.55;
/** A trace of bend that never goes away, so the legs are never locked straight. */
const KNEE_IDLE = 0.05;

/** Peak elbow flex at full sprint, and its resting trace. */
const ELBOW = 0.75;
const ELBOW_IDLE = 0.12;

/** Roll toward the leading leg, radians at full sprint. */
const ROLL = 0.06;

/**
 * Idle motion, for a character that is standing still.
 *
 * All of it fades out as `gait` comes up, so this is the standing pose rather
 * than a second animation fighting the walk. It matters more than it sounds:
 * the shop shows a character with no speed at all, and a model that holds
 * perfectly still there reads as a photograph of a toy.
 */
const IDLE_BREATH = 0.012;
const IDLE_SWAY = 0.05;
const IDLE_ROLL = 0.02;

/**
 * How square-on to the facing a step has to be before it is allowed to decide
 * which way the legs cycle. cos(75 deg) — so running forward or backing up
 * flips the stride, while a pure sideways strafe leaves it alone rather than
 * chattering between the two every frame as the dot product crosses zero.
 */
const STRIDE_COMMIT = 0.25;

/**
 * Everything a renderer needs to pose an avatar this frame.
 *
 * ── The one convention in here ───────────────────────────────────────────
 *
 * Every **swing** (`lean`, `legL`, `armL`, `roll`) is signed, and is stated in
 * the space the courier is authored in — forward is local -Z, so a positive
 * X rotation carries a hanging limb forwards. A renderer whose model faces the
 * other way negates them; see `FACE_SIGN` in CharacterRig.
 *
 * Every **flex** (`kneeL`, `elbowL`, …) is a magnitude and is never negative,
 * because a knee and an elbow each bend one way only. The renderer applies the
 * sign, and the two are opposite: a knee folds the shin backwards, an elbow
 * folds the forearm forwards. Storing these signed is how you end up with a
 * character whose knees bend the wrong way on one model and not the other,
 * which — unlike a mirrored leg swing — is instantly visible.
 */
export interface GaitPose {
  /** 0..1 — how close to a full sprint this is. Drives lean, bob and swing. */
  gait: number;
  /** 0..1 landing squash, already decayed for this frame. */
  squash: number;
  /** Forward tip of the whole body, radians. */
  lean: number;
  /** Side-to-side roll toward the leading leg, radians. */
  roll: number;
  /** Vertical bob, in model units at the avatar's own scale. */
  bob: number;
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  /** Knee flex, >= 0. Folds the shin backwards. */
  kneeL: number;
  kneeR: number;
  /** Elbow flex, >= 0. Folds the forearm forwards. */
  elbowL: number;
  elbowR: number;
}

export class Gait {
  readonly pose: GaitPose = {
    gait: 0,
    squash: 0,
    lean: 0,
    roll: 0,
    bob: 0,
    legL: 0,
    legR: 0,
    armL: 0,
    armR: 0,
    kneeL: 0,
    kneeR: 0,
    elbowL: 0,
    elbowR: 0,
  };

  private phase = 0;
  private wasOnGround = true;
  /** +1 running forward, -1 backing up. See the stride block below. */
  private stride = 1;

  // Scratch, mutated in place: this runs at 60Hz and fresh vectors every frame
  // would be pure garbage for the collector.
  private prev = new THREE.Vector3();
  private primed = false;
  private here = new THREE.Vector3();
  private step = new THREE.Vector3();
  private face = new THREE.Vector3();
  private quat = new THREE.Quaternion();

  /**
   * Advance one frame.
   *
   * `body` is the object the avatar is planted on — the one whose world
   * transform says where it has travelled and which way it is looking. Its
   * local -Z is taken to be the face, which is the convention both renderers
   * are built to (see `MODEL_FACING`).
   */
  advance(body: THREE.Object3D, motion: AvatarMotion, dt: number, elapsed: number) {
    const p = this.pose;
    const speed = motion.moveSpeed;
    p.gait = Math.min(1, speed / FEEL.runSpeed);

    // ── Landing squash (impact-scaled, so a hop barely registers) ──────────
    if (motion.isOnGround && !this.wasOnGround) {
      p.squash = Math.min(1, Math.abs(motion.verticalSpeed) / FEEL.hardLandVel);
    }
    this.wasOnGround = motion.isOnGround;
    p.squash = Math.max(0, p.squash - dt / FEEL.squashRecover);

    // Lean into the run — a body that stays bolt upright reads as sliding.
    p.lean = -LEAN * p.gait;

    // ── Stride direction ───────────────────────────────────────────────────
    /**
     * `moveSpeed` is a magnitude, so on its own it cannot tell running from
     * backing up — the phase always advanced forwards and the character
     * moonwalked. That never showed while the body turned to face its own
     * direction of travel, because then there was no such thing as backwards.
     * Shift lock-on introduced one: the body holds the camera's heading while
     * you strafe and reverse around it.
     *
     * Measured from the avatar's own world transform rather than from a
     * velocity handed in, because that is the one source both kinds of avatar
     * have. A peer carries position and yaw and no signed velocity at all.
     */
    body.getWorldPosition(this.here);
    if (!this.primed) {
      this.prev.copy(this.here);
      this.primed = true;
    }
    this.step.subVectors(this.here, this.prev).setY(0);
    this.prev.copy(this.here);

    const stepLen = this.step.length();
    if (stepLen > 1e-4) {
      body.getWorldQuaternion(this.quat);
      this.face.set(0, 0, -1).applyQuaternion(this.quat).setY(0).normalize();
      // Normalised, so the test is an angle and not a speed — otherwise it
      // would behave differently at 30fps and at 144.
      const along = this.step.dot(this.face) / stepLen;
      if (along > STRIDE_COMMIT) this.stride = 1;
      else if (along < -STRIDE_COMMIT) this.stride = -1;
    }

    // ── Gait ───────────────────────────────────────────────────────────────
    // Phase advances with distance travelled, not time, so the legs cannot
    // cycle while standing still and stride rate matches walk vs run for free.
    this.phase += speed * dt * 3.4 * this.stride;
    // -1..1, already faded by speed: every swing below is a multiple of it, so
    // the whole cycle comes up and down together rather than each limb having
    // its own idea of how fast this is.
    const cycle = Math.sin(this.phase) * p.gait;
    const swing = cycle * SWING;

    if (motion.isOnGround) {
      p.legL = swing;
      p.legR = -swing;
      p.armL = -swing * 0.8;
      p.armR = swing * 0.8;

      /**
       * One knee flex per stride per leg, peaking KNEE_LAG after that leg is
       * furthest back — the moment it has to fold to clear the ground.
       *
       * `max(0, …)` is the whole joint: it takes the half of the sine where
       * the knee is folding and flattens the other half to zero, so the shin
       * never swings out the front. Without it this is a hinge, not a knee.
       */
      const foldL = Math.max(0, -Math.sin(this.phase - KNEE_LAG));
      const foldR = Math.max(0, -Math.sin(this.phase + Math.PI - KNEE_LAG));
      // A landing folds both knees at once; the idle trace keeps them from
      // ever locking straight, which is what makes a standing pose read as a
      // person rather than as a mannequin.
      const absorb = p.squash * KNEE_LAND + KNEE_IDLE;
      p.kneeL = KNEE * p.gait * foldL + absorb;
      p.kneeR = KNEE * p.gait * foldR + absorb;

      // Elbows fold as their arm comes forward, and keep a resting bend so the
      // arms are not two planks.
      p.elbowL = ELBOW * Math.max(0, -cycle) + ELBOW_IDLE;
      p.elbowR = ELBOW * Math.max(0, cycle) + ELBOW_IDLE;

      // Roll toward the leading leg. Small — it is the difference between a
      // body walking and a body being slid along, and any more than that is a
      // swagger.
      p.roll = ROLL * cycle;

      // Bob twice per stride, which is what a real walk does — the body rises
      // over each planted leg — plus a slow breath that never stops.
      p.bob = Math.abs(Math.sin(this.phase)) * 0.05 * p.gait + Math.sin(elapsed * 1.6) * IDLE_BREATH;

      // ── Idle ──────────────────────────────────────────────────────────────
      // Faded out by speed, so it is the standing pose and not a second
      // animation arguing with the walk.
      const idle = 1 - p.gait;
      if (idle > 0) {
        const sway = Math.sin(elapsed * 0.8) * IDLE_SWAY * idle;
        p.armL += sway;
        p.armR -= sway;
        p.roll += Math.sin(elapsed * 0.55) * IDLE_ROLL * idle;
      }
    } else {
      // Airborne: tuck the legs and throw the arms up. Lerped so the pose
      // eases in rather than snapping the instant the feet leave the ground.
      const k = 1 - Math.pow(0.001, dt);
      const rising = motion.verticalSpeed > 0;
      p.legL = THREE.MathUtils.lerp(p.legL, rising ? -0.7 : -0.25, k);
      p.legR = THREE.MathUtils.lerp(p.legR, rising ? -0.35 : 0.3, k);
      p.armL = THREE.MathUtils.lerp(p.armL, -2.2, k);
      p.armR = THREE.MathUtils.lerp(p.armR, -2.0, k);
      // A tuck is knees, not hips. Deeper on the way up, opening out on the
      // way down so the legs are reaching for the ground before they meet it.
      p.kneeL = THREE.MathUtils.lerp(p.kneeL, rising ? 1.3 : 0.5, k);
      p.kneeR = THREE.MathUtils.lerp(p.kneeR, rising ? 0.9 : 0.3, k);
      p.elbowL = THREE.MathUtils.lerp(p.elbowL, 0.9, k);
      p.elbowR = THREE.MathUtils.lerp(p.elbowR, 0.9, k);
      p.roll = THREE.MathUtils.lerp(p.roll, 0, k);
      p.bob = THREE.MathUtils.lerp(p.bob, 0.04, k);
    }
  }
}
