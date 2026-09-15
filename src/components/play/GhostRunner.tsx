"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ghostPoseAt, type GhostTrack } from "@/lib/ghost";
import { useRuns } from "@/lib/runs";
import type { Vec3 } from "@/lib/worlddoc";
import { sfxGhostPass } from "@/lib/sfx/parkour";
import { playerFocus } from "./camera-rig";
import { useCourse } from "./course";

/**
 * A recorded run, replayed alongside the live one.
 *
 * ── Why a ghost rather than a split timer ────────────────────────────────
 *
 * A time on a screen tells you that you are four seconds behind. A figure
 * twenty metres up the course tells you *where* the four seconds went, which
 * is the only version of that information anybody can act on. It is also the
 * one competitive feature that costs a solo player nothing: nobody has to be
 * online, and being beaten by a recording is not being beaten by a person.
 *
 * ── Why it is not a second CharacterModel ────────────────────────────────
 *
 * `CharacterModel` is driven entirely from a live `EcctrlHandle` — its gait,
 * its lean and its squash all read the controller. A ghost has no controller;
 * it has four numbers per tenth of a second. Rigging a fake handle to feed it
 * would be more code than the figure, and it would animate off derived
 * velocities that are wrong in exactly the places a replay is interesting.
 * So this is a deliberately simpler shape that reads as "a runner" at the
 * distance a ghost is ever seen from, with a stride driven by how fast the
 * recording is actually moving.
 */

// Module scope, like every other procedural model here: one allocation per
// shape for the life of the tab, however many times Play is entered.
const G = {
  head: new RoundedBoxGeometry(0.44, 0.36, 0.4, 3, 0.07),
  torso: new RoundedBoxGeometry(0.4, 0.44, 0.3, 3, 0.08),
  limb: new RoundedBoxGeometry(0.12, 0.3, 0.13, 2, 0.045),
};

/**
 * Translucent, unlit and shadowless.
 *
 * A ghost that casts a shadow is a solid object the player will try to stand
 * on; one that takes light reads as another runner and gets in the way of
 * reading the course. `depthWrite: false` keeps its own limbs from punching
 * holes in each other where they overlap.
 */
const MAT = new THREE.MeshBasicMaterial({
  color: "#7dd3fc",
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  toneMapped: false,
});

/** Matches CharacterModel's own drop, so the ghost's soles meet the floor. */
const GROUND_OFFSET = -0.8;
/** The avatar is built facing -Z and turned round, exactly as the player is. */
const MODEL_FACING = Math.PI;

/** Radians of leg swing at a full sprint. */
const SWING = 0.8;
/** Ground speed, in units per second, that counts as a full sprint. */
const SPRINT = 5;
/** Strides per second at a full sprint. */
const CADENCE = 2.6;

/**
 * How far one has to lead before a change of places counts, in world units.
 * The two figures spend most of a close run within a stride of each other,
 * and a whoosh on every stride would be noise; a lead of two blocks is a
 * pass anybody watching would agree happened.
 */
const PASS_MARGIN = 2;
/** Seconds between passes that can sound, so a duel does not chatter. */
const PASS_COOLDOWN = 1.2;

export function GhostRunner({ goal }: { goal?: Vec3 }) {
  const root = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  // +1 when the player leads, -1 when the ghost does, 0 until decided.
  const lead = useRef(0);
  const lastPass = useRef(-Infinity);
  /** The run the lead was decided in; a restart starts undecided. */
  const leadRun = useRef<number | null>(null);
  const view = useRef(new THREE.Vector3());
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);

  const ghost = useRuns((s) => s.ghost);
  const worldId = useRuns((s) => s.worldId);
  const ghostWho = useRuns((s) => s.ghostWho);

  /**
   * Fall back to the record when the player has no run of their own here.
   *
   * The recorder asks for "me" first, because your own last run is the one
   * worth chasing. On a course you have never finished that request comes back
   * empty, and an empty answer should mean "then show me the best there is",
   * not "then show nothing".
   */
  useEffect(() => {
    if (ghost || !worldId || ghostWho !== "me") return;
    void useRuns.getState().loadGhost(worldId, "best");
  }, [ghost, worldId, ghostWho]);

  // Phase is integrated rather than derived from the clock, so the gait does
  // not stutter when the run restarts and the clock jumps back to zero.
  const phase = useRef(0);
  const prev = useRef(new THREE.Vector3());
  const primed = useRef(false);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;

    const track = useRuns.getState().ghost;
    const { startedAt, finishedMs } = useCourse.getState();
    if (!track || startedAt === null) {
      g.visible = false;
      primed.current = false;
      return;
    }

    // The ghost runs against the live clock, so it is always exactly as far
    // ahead as the time difference — which is the whole point of it.
    const elapsed = finishedMs ?? performance.now() - startedAt;
    const pose = ghostPoseAt(track as GhostTrack, elapsed);
    if (!pose) {
      g.visible = false;
      return;
    }

    g.visible = true;
    g.position.set(pose.x, pose.y + GROUND_OFFSET, pose.z);

    // Who is ahead: whoever is nearer the goal, by more than the margin. The
    // pass is panned to the side the ghost is on in the camera's view, so the
    // sound says where to look. A finished run has nothing left to pass.
    if (leadRun.current !== startedAt) {
      leadRun.current = startedAt;
      lead.current = 0;
      lastPass.current = -Infinity;
    }
    if (goal && finishedMs === null) {
      const mine = Math.hypot(playerFocus.x - goal[0], playerFocus.z - goal[2]);
      const theirs = Math.hypot(pose.x - goal[0], pose.z - goal[2]);
      const gap = theirs - mine; // positive: the player leads
      const now = elapsed / 1000;
      const next = gap > PASS_MARGIN ? 1 : gap < -PASS_MARGIN ? -1 : lead.current;
      if (next !== lead.current) {
        const decided = lead.current !== 0;
        lead.current = next;
        if (decided && now - lastPass.current > PASS_COOLDOWN) {
          lastPass.current = now;
          view.current.set(pose.x, pose.y, pose.z).project(camera);
          const pan = Math.max(-1, Math.min(1, view.current.x));
          sfxGhostPass(next > 0, pan);
        }
      }
    } else {
      lead.current = 0;
    }
    // The stored yaw is a camera heading, so the figure faces the direction
    // that heading looks along — the negation of it. See lib/course-kit.ts.
    g.rotation.y = pose.yaw + Math.PI + MODEL_FACING;

    // Stride from the replay's own speed. Sampled between frames rather than
    // from the track's rate so it is right at any refresh rate.
    if (!primed.current) {
      primed.current = true;
      prev.current.set(pose.x, pose.y, pose.z);
    }
    const step = Math.max(dt, 1e-4);
    const speed =
      Math.hypot(pose.x - prev.current.x, pose.z - prev.current.z) / step;
    prev.current.set(pose.x, pose.y, pose.z);

    const gait = Math.min(1, speed / SPRINT);
    phase.current += gait * CADENCE * Math.PI * 2 * dt;
    const swing = Math.sin(phase.current) * SWING * gait;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.7;
    if (armR.current) armR.current.rotation.x = swing * 0.7;
  });

  return (
    <group ref={root} visible={false}>
      <group rotation={[0, MODEL_FACING, 0]}>
        <mesh geometry={G.torso} material={MAT} position={[0, 0.6, 0]} />
        <mesh geometry={G.head} material={MAT} position={[0, 1.02, 0]} />

        <group ref={armL} position={[-0.26, 0.78, 0]}>
          <mesh geometry={G.limb} material={MAT} position={[0, -0.15, 0]} />
        </group>
        <group ref={armR} position={[0.26, 0.78, 0]}>
          <mesh geometry={G.limb} material={MAT} position={[0, -0.15, 0]} />
        </group>
        <group ref={legL} position={[-0.1, 0.38, 0]}>
          <mesh geometry={G.limb} material={MAT} position={[0, -0.15, 0]} />
        </group>
        <group ref={legR} position={[0.1, 0.38, 0]}>
          <mesh geometry={G.limb} material={MAT} position={[0, -0.15, 0]} />
        </group>
      </group>
    </group>
  );
}
