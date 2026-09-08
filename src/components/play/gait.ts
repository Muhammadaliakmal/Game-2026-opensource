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
 * How square-on to the facing a step has to be before it is allowed to decide
 * which way the legs cycle. cos(75 deg) — so running forward or backing up
 * flips the stride, while a pure sideways strafe leaves it alone rather than
 * chattering between the two every frame as the dot product crosses zero.
 */
const STRIDE_COMMIT = 0.25;

/** Everything a renderer needs to pose an avatar this frame. */
export interface GaitPose {
  /** 0..1 — how close to a full sprint this is. Drives lean, bob and swing. */
  gait: number;
  /** 0..1 landing squash, already decayed for this frame. */
  squash: number;
  /** Forward tip of the whole body, radians. */
  lean: number;
  /** Vertical bob, in model units at the avatar's own scale. */
  bob: number;
  legL: number;
  legR: number;
  armL: number;
  armR: number;
}

export class Gait {
  readonly pose: GaitPose = {
    gait: 0,
    squash: 0,
    lean: 0,
    bob: 0,
    legL: 0,
    legR: 0,
    armL: 0,
    armR: 0,
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
    const swing = Math.sin(this.phase) * SWING * p.gait;

    if (motion.isOnGround) {
      p.legL = swing;
      p.legR = -swing;
      p.armL = -swing * 0.8;
      p.armR = swing * 0.8;
      // Bob on the off-beat of the stride, plus a slow idle breath.
      p.bob = Math.abs(Math.sin(this.phase)) * 0.035 * p.gait + Math.sin(elapsed * 1.6) * 0.012;
    } else {
      // Airborne: tuck the legs and throw the arms up. Lerped so the pose
      // eases in rather than snapping the instant the feet leave the ground.
      const k = 1 - Math.pow(0.001, dt);
      const rising = motion.verticalSpeed > 0;
      p.legL = THREE.MathUtils.lerp(p.legL, rising ? -0.7 : -0.25, k);
      p.legR = THREE.MathUtils.lerp(p.legR, rising ? -0.35 : 0.3, k);
      p.armL = THREE.MathUtils.lerp(p.armL, -2.2, k);
      p.armR = THREE.MathUtils.lerp(p.armR, -2.0, k);
      p.bob = THREE.MathUtils.lerp(p.bob, 0.04, k);
    }
  }
}
