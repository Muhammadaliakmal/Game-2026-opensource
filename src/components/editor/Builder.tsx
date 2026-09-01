"use client";

import * as THREE from "three";
import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useEditorStore } from "@/stores/editor-store";
import { cellFromHit } from "@/lib/grid";
import { sfxErase, sfxPlace, sfxSpawn } from "@/lib/audio";
import { punch } from "./punch";
import { GROUND_SIZE } from "./Ground";

const HALF = GROUND_SIZE / 2;

/** Keep builds on the grid and above the floor. */
function inBounds([x, y, z]: [number, number, number]) {
  return y >= 0 && x >= -HALF && x < HALF && z >= -HALF && z < HALF;
}

/**
 * Turns pointer events into grid edits.
 *
 * Wraps the scene in a group and relies on R3F event bubbling, so it picks up
 * hits on both the ground plane and the instanced parts without either needing
 * to know about it.
 *
 * Mouse convention: LEFT builds, RIGHT orbits (configured on OrbitControls).
 * That split is what makes drag-painting possible at all — if left-drag also
 * orbited, every paint stroke would swing the camera.
 */
export function Builder({ children }: { children: React.ReactNode }) {
  const painting = useRef(false);
  // Last cell edited in this stroke, so dragging across one cell doesn't
  // re-emit the same edit dozens of times.
  const lastCell = useRef<string | null>(null);

  const cellFor = useCallback((e: ThreeEvent<PointerEvent>, place: boolean) => {
    const hit = {
      point: e.point,
      face: e.face,
      instanceId: e.instanceId,
      object: e.object,
    } as unknown as THREE.Intersection;
    return cellFromHit(hit, place);
  }, []);

  const applyAt = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = useEditorStore.getState();
      if (s.readOnly) return;

      // The spawn tool targets the empty cell in front of the face you clicked,
      // same as placing — that's where the character would stand.
      const placing = s.tool !== "erase";
      const cell = cellFor(e, placing);
      if (!inBounds(cell)) return;

      const key = `${cell[0]},${cell[1]},${cell[2]}`;
      if (lastCell.current === key) return;
      lastCell.current = key;

      if (s.tool === "spawn") {
        s.setSpawn(cell);
        sfxSpawn();
      } else if (placing) {
        s.place(cell);
        // Sound and the scale-in pop are the physical feedback for the core
        // action — SPEC §8 calls the placement punch the one animation that
        // has to be there.
        punch(key);
        sfxPlace();
      } else {
        s.erase(cell);
        sfxErase();
      }
    },
    [cellFor]
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = useEditorStore.getState();
      const cell = cellFor(e, s.tool !== "erase");
      s.setHoverCell(inBounds(cell) ? cell : null);

      // Dragging the spawn point around would spam the undo stack with a
      // command per cell crossed; it's a single click.
      if (painting.current && useEditorStore.getState().tool !== "spawn") {
        applyAt(e);
      }
    },
    [applyAt, cellFor]
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return; // left button only; right belongs to the camera
      e.stopPropagation();
      painting.current = true;
      lastCell.current = null;
      useEditorStore.getState().beginStroke();
      applyAt(e);
    },
    [applyAt]
  );

  const endStroke = useCallback(() => {
    if (!painting.current) return;
    painting.current = false;
    lastCell.current = null;
    useEditorStore.getState().endStroke();
  }, []);

  return (
    <group
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={endStroke}
      // Releasing outside the canvas must still close the stroke, or the next
      // edit silently joins the previous one's undo step.
      onPointerLeave={() => {
        endStroke();
        useEditorStore.getState().setHoverCell(null);
      }}
    >
      {children}
    </group>
  );
}
