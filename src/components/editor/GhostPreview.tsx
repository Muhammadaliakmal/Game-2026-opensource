"use client";

import * as THREE from "three";
import { useMemo } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE } from "@/lib/worlddoc";
import { SHAPE_GEOMETRIES } from "./shapes";

/**
 * Translucent preview of the block about to be placed, snapped to the hovered
 * cell. Immediate visual feedback is the whole creative loop — the player
 * should never have to guess where a click will land.
 */
export function GhostPreview() {
  const hoverCell = useEditorStore((s) => s.hoverCell);
  const shape = useEditorStore((s) => s.shape);
  const colorIndex = useEditorStore((s) => s.colorIndex);
  const rot = useEditorStore((s) => s.rot);
  const tool = useEditorStore((s) => s.tool);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    []
  );

  if (!hoverCell) return null;

  // The spawn tool isn't placing a block, so previewing one would be a lie
  // about what the click does.
  if (tool === "spawn") {
    return (
      <group position={[hoverCell[0] + 0.5, hoverCell[1], hoverCell[2] + 0.5]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.34, 0.46, 32]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 2.2, 8]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Erase mode previews in red rather than the brush colour, so the two modes
  // are never confusable at a glance.
  material.color.set(tool === "erase" ? "#fb7185" : PALETTE[colorIndex]);

  return (
    <group
      position={[hoverCell[0] + 0.5, hoverCell[1] + 0.5, hoverCell[2] + 0.5]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
    >
      <mesh geometry={SHAPE_GEOMETRIES[shape]} material={material} />
      {/* Wireframe edge so the ghost reads clearly against same-coloured blocks. */}
      <lineSegments>
        <edgesGeometry args={[SHAPE_GEOMETRIES[shape]]} />
        <lineBasicMaterial color={tool === "erase" ? "#fb7185" : "#22d3ee"} />
      </lineSegments>
    </group>
  );
}
