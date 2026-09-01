"use client";

import { useEditorStore } from "@/stores/editor-store";

/**
 * Where the player will appear in Play mode.
 *
 * Worth drawing even though it isn't a block: the spawn point is invisible
 * state that decides where every playthrough begins, and building a world half
 * a map away from it (then wondering why Play drops you somewhere else) is the
 * obvious trap. A glowing post plus a ring on the floor reads as "you start
 * here" without competing with the build.
 */
export function SpawnMarker() {
  const spawn = useEditorStore((s) => s.spawn);
  const tool = useEditorStore((s) => s.tool);

  // Loud while the spawn tool is armed, quiet the rest of the time.
  const active = tool === "spawn";

  return (
    <group position={[spawn[0], spawn[1] - 1.2, spawn[2]]}>
      {/* Floor ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.34, 0.46, 32]} />
        <meshBasicMaterial
          color="#ffb020"
          transparent
          opacity={active ? 0.95 : 0.5}
          depthWrite={false}
        />
      </mesh>
      {/* Beam */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 2.2, 8]} />
        <meshBasicMaterial
          color="#ffb020"
          transparent
          opacity={active ? 0.55 : 0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
