"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Vec3 } from "@/lib/worlddoc";
import { playerFocus } from "./camera-rig";
import { onRespawned } from "./play-actions";
import { useCourse } from "./course";

/**
 * The finish of a course: a beacon you can see from a distance, and the test
 * that decides you have reached it.
 *
 * Mounted only for worlds that have a `goal`. The parkour course already ended
 * in a lit tower, but a lit tower is scenery — nothing said arriving there was
 * the point, and nothing happened when you did.
 *
 * The arrival test reads `playerFocus`, the character position the camera rig
 * mirrors every frame, rather than taking the Ecctrl handle: this sits outside
 * <Ecctrl> in the tree and has no business reaching into the controller for a
 * number the rig already publishes.
 */

/**
 * How close counts.
 *
 * Radius covers the whole 3x3 podium under the parkour marker, so the last
 * one-cell hop onto the lit block is a flourish rather than a requirement.
 * The vertical band is generous upward (you may be mid-jump when you cross it)
 * and tight downward, so running past the base of the tower is not a finish.
 */
const GOAL_RADIUS = 2.4;
const GOAL_ABOVE = 2.5;
const GOAL_BELOW = 1.6;

export function GoalZone({ goal, worldId }: { goal: Vec3; worldId: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);

  const begin = useCourse((s) => s.begin);
  const clear = useCourse((s) => s.clear);

  // Start the clock on entry, and restart it on every respawn — a fall in an
  // obby is a failed attempt, and carrying the old elapsed time into the next
  // one would make the timer meaningless.
  useEffect(() => {
    begin(worldId);
    const off = onRespawned(() => begin(worldId));
    return () => {
      off();
      clear();
    };
  }, [begin, clear, worldId]);

  useFrame((state, dt) => {
    const finished = useCourse.getState().finishedMs !== null;

    // Beacon. Spins slowly and breathes; goes still and dims once won, so the
    // world itself acknowledges the finish rather than only the HUD doing it.
    const t = state.clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.z += dt * (finished ? 0.2 : 0.9);
      const s = finished ? 1.25 : 1 + Math.sin(t * 2.2) * 0.06;
      ring.current.scale.setScalar(s);
    }
    if (core.current) {
      core.current.position.y = Math.sin(t * 1.4) * 0.12;
    }
    if (beam.current) {
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = finished ? 0.05 : 0.14 + Math.sin(t * 2.2) * 0.04;
    }

    if (finished) return;

    // Cylinder test rather than a sphere: the podium is flat and wide, and a
    // sphere would demand more precision at its edges than at its centre for
    // no reason a player could ever perceive.
    const dx = playerFocus.x - goal[0];
    const dz = playerFocus.z - goal[2];
    if (dx * dx + dz * dz > GOAL_RADIUS * GOAL_RADIUS) return;

    const dy = playerFocus.y - goal[1];
    if (dy > GOAL_ABOVE || dy < -GOAL_BELOW) return;

    useCourse.getState().complete();
  });

  return (
    <group position={goal}>
      {/* A soft column, so the finish reads from across the course. */}
      <mesh ref={beam} position={[0, 5, 0]} raycast={() => null}>
        <cylinderGeometry args={[1.1, 1.1, 12, 16, 1, true]} />
        <meshBasicMaterial
          color="#a3e635"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Flat ring on the deck marking exactly what counts as arriving. */}
      <mesh
        ref={ring}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.94, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[GOAL_RADIUS - 0.35, GOAL_RADIUS, 48]} />
        <meshBasicMaterial
          color="#a3e635"
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={core} raycast={() => null}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial
          color="#a3e635"
          emissive="#a3e635"
          emissiveIntensity={2.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
