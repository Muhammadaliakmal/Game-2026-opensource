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

  // Erase mode previews in red rather than the brush colour, so the two modes
  // are never confusable at a glance.
  material.color.set(tool === "erase" ? "#ef4444" : PALETTE[colorIndex]);

  return (
    <group
      position={[hoverCell[0] + 0.5, hoverCell[1] + 0.5, hoverCell[2] + 0.5]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
    >
      <mesh geometry={SHAPE_GEOMETRIES[shape]} material={material} />
      {/* Wireframe edge so the ghost reads clearly against same-coloured blocks. */}
      <lineSegments>
        <edgesGeometry args={[SHAPE_GEOMETRIES[shape]]} />
        <lineBasicMaterial color={tool === "erase" ? "#ef4444" : "#ffffff"} />
      </lineSegments>
    </group>
  );
}
