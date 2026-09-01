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
  // The pointer that owns the current stroke. Touch delivers one pointer per
  // finger, and without this the second finger of an orbit gesture would keep
  // painting while the camera moved.
  const strokeId = useRef<number | null>(null);
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

      // Build and spawn target the empty cell in front of the face you
      // clicked (that is where a block, or the character, would go). Erase,
      // paint and pick target the block you actually clicked on.
      const outward = s.tool === "place" || s.tool === "spawn";
      const cell = cellFor(e, outward);
      if (!inBounds(cell)) return;

      const key = `${cell[0]},${cell[1]},${cell[2]}`;
      if (lastCell.current === key) return;
      lastCell.current = key;

      if (s.tool === "spawn") {
        s.setSpawn(cell);
        sfxSpawn();
      } else if (s.tool === "pick") {
        s.pick(cell);
      } else if (s.tool === "paint") {
        s.paint(cell);
        sfxPlace();
      } else if (s.tool === "place") {
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
      // Ignore fingers that are not the one that started the stroke.
      if (strokeId.current !== null && e.pointerId !== strokeId.current) return;

      const s = useEditorStore.getState();
      const cell = cellFor(e, s.tool === "place" || s.tool === "spawn");
      s.setHoverCell(inBounds(cell) ? cell : null);

      // Spawn and pick are single-shot: dragging either one would spam the
      // undo stack (or the brush) with one action per cell crossed.
      const tool = useEditorStore.getState().tool;
      if (painting.current && tool !== "spawn" && tool !== "pick") {
        applyAt(e);
      }
    },
    [applyAt, cellFor]
  );

  const endStroke = useCallback(() => {
    if (!painting.current) return;
    painting.current = false;
    strokeId.current = null;
    lastCell.current = null;
    useEditorStore.getState().endStroke();
  }, []);

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return; // left button only; right belongs to the camera

      // A second finger means the player is reaching for the camera, not
      // drawing. Close the stroke and stay out of the way.
      if (strokeId.current !== null) {
        endStroke();
        return;
      }

      e.stopPropagation();
      painting.current = true;
      strokeId.current = e.pointerId;
      lastCell.current = null;
      useEditorStore.getState().beginStroke();
      applyAt(e);
    },
    [applyAt, endStroke]
  );

  return (
    <group
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={(e) => {
        if (strokeId.current === null || e.pointerId === strokeId.current) {
          endStroke();
        }
      }}
      // A finger lifted off the canvas edge, or cancelled by the browser
      // claiming the gesture, must still close the stroke.
      onPointerCancel={endStroke}
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
