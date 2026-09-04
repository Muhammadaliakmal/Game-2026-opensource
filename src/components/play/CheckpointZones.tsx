"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Checkpoint } from "@/lib/worlddoc";
import { CHECKPOINT_RADIUS, checkpointAt } from "@/lib/checkpoints";
import { HAPTIC, haptic } from "@/lib/player-settings";
import { sfxSpawn } from "@/lib/audio";
import { playerFocus } from "./camera-rig";
import { useCourse } from "./course";

/**
 * The gates a run resumes from.
 *
 * One component for the whole list rather than one per checkpoint: the
 * detection is a single test against the next unreached gate, and mounting a
 * frame loop per gate would run five of them to answer a question only one of
 * them can be the answer to.
 *
 * Position comes from `playerFocus`, which the camera rig mirrors every frame,
 * for the same reason `GoalZone` reads it: this sits outside `<Ecctrl>` and has
 * no business reaching into the controller for a number already published.
 *
 * ── What arriving looks like ─────────────────────────────────────────────
 *
 * Reached gates go solid and stop moving; the next one breathes. That is the
 * only progress indicator a runner gets while actually running — the HUD count
 * is for between attempts — and it has to be readable from the far side of a
 * jump, which is why it is a change of *state* rather than a change of colour.
 */

const REACHED = "#7cff3d";
const PENDING = "#00fff5";

export function CheckpointZones({
  checkpoints,
}: {
  checkpoints: readonly Checkpoint[];
}) {
  const current = useCourse((s) => s.checkpoint);
  const setCount = useCourse((s) => s.setCheckpointCount);

  useEffect(() => {
    setCount(checkpoints.length);
  }, [checkpoints.length, setCount]);

  // Held in a ref as well as read from the store: the frame loop must see the
  // value it wrote on the previous frame, and a store subscription only
  // updates this component on the next render. Synced after the render rather
  // than during it — a `begin()` that resets progress has to reach the loop.
  const held = useRef(current);
  useEffect(() => {
    held.current = current;
  }, [current]);

  useFrame(() => {
    if (checkpoints.length === 0) return;
    if (useCourse.getState().finishedMs !== null) return;

    const next = checkpointAt(
      playerFocus.x,
      playerFocus.y,
      playerFocus.z,
      checkpoints,
      held.current
    );
    if (next === held.current) return;

    held.current = next;
    useCourse.getState().reachCheckpoint(next);
    // The same two-channel confirmation the rest of the game uses for "that
    // worked": a sound, and a buzz for the hand that cannot hear it.
    sfxSpawn();
    haptic(HAPTIC.event);
  });

  return (
    <>
      {checkpoints.map((cp, i) => (
        <Gate key={i} cp={cp} reached={i <= current} />
      ))}
    </>
  );
}

function Gate({ cp, reached }: { cp: Checkpoint; reached: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const color = reached ? REACHED : PENDING;

  // A per-gate phase so a row of them breathes as a row rather than pulsing in
  // lockstep, which reads as a rendering fault rather than as a light.
  const phase = useMemo(() => (cp.pos[0] + cp.pos[2]) * 0.37, [cp.pos]);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    if (ring.current) {
      // Reached gates go still. Motion is what says "this one is next", so it
      // has to stop meaning anything else.
      ring.current.scale.setScalar(reached ? 1 : 1 + Math.sin(t * 2.4) * 0.07);
    }
    if (beam.current) {
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = reached ? 0.06 : 0.12 + Math.sin(t * 2.4) * 0.04;
    }
  });

  return (
    <group position={cp.pos}>
      <mesh ref={beam} position={[0, 3, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.9, 0.9, 7, 12, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh
        ref={ring}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.94, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[CHECKPOINT_RADIUS - 0.3, CHECKPOINT_RADIUS, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={reached ? 0.85 : 0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
