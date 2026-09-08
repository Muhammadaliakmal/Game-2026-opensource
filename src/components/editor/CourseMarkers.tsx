"use client";

import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useEditorStore } from "@/stores/editor-store";
import { CHECKPOINT_RADIUS } from "@/lib/checkpoints";
import type { Checkpoint, Vec3 } from "@/lib/worlddoc";

/**
 * The finish and the resume points, while building.
 *
 * The play-mode counterparts (`GoalZone`, `CheckpointZones`) draw the same two
 * things and are not reusable here, for one reason each: `GoalZone` starts the
 * run clock in an effect, and `CheckpointZones` runs the arrival test in a
 * frame loop against a character that does not exist in build mode. What is
 * shared is the *look* — same colours, same radii, same ring-on-the-deck
 * vocabulary — so that what you place is recognisably what you will run.
 *
 * ── Nothing here animates, deliberately ──────────────────────────────────
 *
 * The editor canvas is `frameloop="demand"`: it renders when something asks it
 * to, not sixty times a second. A breathing ring would therefore either not
 * breathe, or would have to call `invalidate()` every frame and quietly undo
 * the reason the editor is on demand in the first place. Motion is what tells
 * a runner which gate is next; a builder can see the whole course at once and
 * needs the numbers instead.
 *
 * ── Why the count is drawn as a number ───────────────────────────────────
 *
 * Order is the entire meaning of a checkpoint — `checkpoints.ts` reads "later
 * in the course" straight off the array — and it is invisible in geometry. Two
 * gates fifty units apart look identical and one of them is a soft-lock. So
 * each carries its index, in the same `Html` label the multiplayer peers use
 * for names, which is the one piece of in-world text this app already ships.
 */

const GOAL_COLOR = "#a3e635";
const CP_COLOR = "#00fff5";

/** Matches GoalZone's arrival radius, so what you place is what will count. */
const GOAL_RADIUS = 2.4;

export function CourseMarkers() {
  const goal = useEditorStore((s) => s.goal);
  const checkpoints = useEditorStore((s) => s.checkpoints);
  const tool = useEditorStore((s) => s.tool);

  return (
    <>
      {goal && <GoalMarker pos={goal} active={tool === "goal"} />}
      {checkpoints.map((cp, i) => (
        <CheckpointMarker
          key={`${cp.pos.join()}:${i}`}
          cp={cp}
          index={i}
          active={tool === "checkpoint"}
        />
      ))}
    </>
  );
}

function GoalMarker({ pos, active }: { pos: Vec3; active: boolean }) {
  return (
    <group position={pos}>
      <mesh position={[0, 5, 0]} raycast={() => null}>
        <cylinderGeometry args={[1.1, 1.1, 12, 16, 1, true]} />
        <meshBasicMaterial
          color={GOAL_COLOR}
          transparent
          opacity={active ? 0.2 : 0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={() => null}>
        <ringGeometry args={[GOAL_RADIUS - 0.35, GOAL_RADIUS, 48]} />
        <meshBasicMaterial
          color={GOAL_COLOR}
          transparent
          opacity={active ? 0.95 : 0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0.9, 0]} raycast={() => null}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial
          color={GOAL_COLOR}
          emissive={GOAL_COLOR}
          emissiveIntensity={active ? 2.6 : 1.2}
          toneMapped={false}
        />
      </mesh>

      <Html center position={[0, 2.1, 0]} distanceFactor={18} zIndexRange={[10, 0]}>
        <span className="hud-label bg-base/80 rounded px-1.5 py-0.5 whitespace-nowrap text-white/90">
          Finish
        </span>
      </Html>
    </group>
  );
}

function CheckpointMarker({
  cp,
  index,
  active,
}: {
  cp: Checkpoint;
  index: number;
  active: boolean;
}) {
  // The direction a run resumes looking, drawn as a stub pointing that way.
  // Without it `yaw` is invisible until someone falls, which is the worst
  // moment to discover a gate turns you back the way you came — the exact bug
  // `course-kit.ts`'s FACING comment records shipping once already.
  const look: [number, number] = [-Math.sin(cp.yaw), -Math.cos(cp.yaw)];

  return (
    <group position={cp.pos}>
      <mesh position={[0, 3, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.9, 0.9, 7, 12, 1, true]} />
        <meshBasicMaterial
          color={CP_COLOR}
          transparent
          opacity={active ? 0.18 : 0.09}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={() => null}>
        <ringGeometry args={[CHECKPOINT_RADIUS - 0.3, CHECKPOINT_RADIUS, 40]} />
        <meshBasicMaterial
          color={CP_COLOR}
          transparent
          opacity={active ? 0.85 : 0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh
        position={[look[0] * (CHECKPOINT_RADIUS - 0.5), 0.05, look[1] * (CHECKPOINT_RADIUS - 0.5)]}
        rotation={[-Math.PI / 2, 0, Math.atan2(-look[0], look[1])]}
        raycast={() => null}
      >
        <circleGeometry args={[0.42, 3]} />
        <meshBasicMaterial
          color={CP_COLOR}
          transparent
          opacity={active ? 0.95 : 0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Html center position={[0, 1.6, 0]} distanceFactor={18} zIndexRange={[10, 0]}>
        <span className="hud-label bg-base/80 rounded px-1.5 py-0.5 whitespace-nowrap text-white/90">
          {index + 1}
        </span>
      </Html>
    </group>
  );
}
