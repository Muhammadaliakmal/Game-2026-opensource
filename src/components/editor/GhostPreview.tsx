"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE } from "@/lib/worlddoc";
import { SHAPE_GEOMETRIES } from "./shapes";

/**
 * Translucent preview of what the current tool will do, snapped to the hovered
 * cell. Immediate visual feedback is the whole creative loop — the player
 * should never have to guess where a click will land.
 *
 * Brush settings (shape, colour, rotation, tool) come through React because
 * they change when a button is pressed. The hovered CELL does not: it changes
 * every time the cursor crosses a grid line, many times a second during a
 * drag, so it is applied straight to the object3D from a store subscription.
 * Re-rendering React at pointer speed over a live canvas is the single most
 * expensive mistake available here (UI spec §5).
 */
export function GhostPreview() {
  const shape = useEditorStore((s) => s.shape);
  const colorIndex = useEditorStore((s) => s.colorIndex);
  const rot = useEditorStore((s) => s.rot);
  const tool = useEditorStore((s) => s.tool);
  const invalidate = useThree((s) => s.invalidate);

  const group = useRef<THREE.Group>(null);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  // Erase previews in the danger colour and everything else in the accent, so
  // no two tools are confusable at a glance.
  const accent = tool === "erase" ? "#e5484d" : "#ffb020";
  material.color.set(tool === "erase" ? "#e5484d" : PALETTE[colorIndex]);

  // The spawn marker sits ON the cell floor; a block preview fills the cell.
  const spawnTool = tool === "spawn";

  useEffect(() => {
    const apply = () => {
      const g = group.current;
      if (!g) return;
      const cell = useEditorStore.getState().hoverCell;
      if (!cell) {
        if (g.visible) {
          g.visible = false;
          invalidate();
        }
        return;
      }
      g.visible = true;
      g.position.set(
        cell[0] + 0.5,
        spawnTool ? cell[1] : cell[1] + 0.5,
        cell[2] + 0.5
      );
      invalidate();
    };
    apply();
    return useEditorStore.subscribe(apply);
  }, [invalidate, spawnTool]);

  return (
    <group ref={group} visible={false}>
      <group rotation={[0, spawnTool ? 0 : (rot * Math.PI) / 2, 0]}>
        {spawnTool ? (
          // Not a block: previewing one would be a lie about what the click does.
          <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[0.34, 0.46, 32]} />
              <meshBasicMaterial
                color={accent}
                transparent
                opacity={0.85}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 2.2, 8]} />
              <meshBasicMaterial
                color={accent}
                transparent
                opacity={0.4}
                depthWrite={false}
              />
            </mesh>
          </>
        ) : (
          <>
            <mesh geometry={SHAPE_GEOMETRIES[shape]} material={material} />
            {/* Wireframe edge so the ghost reads clearly against
                same-coloured blocks. */}
            <lineSegments>
              <edgesGeometry args={[SHAPE_GEOMETRIES[shape]]} />
              <lineBasicMaterial color={accent} />
            </lineSegments>
          </>
        )}
      </group>
    </group>
  );
}
