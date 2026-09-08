"use client";

import * as THREE from "three";
import { useCallback, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEditorStore, type Tool } from "@/stores/editor-store";
import { yawTowards } from "@/components/play/camera-rig";
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
 * Does this tool act on the empty cell in front of the face, or on the block
 * itself?
 *
 * Outward for anything that puts something new into the world — a block, the
 * character, a course marker. Inward for the tools that read or change a block
 * that is already there. Named because three separate places need the same
 * answer (the edit, the hover cell, and the drag guard below), and they were
 * already drifting apart when it was two.
 */
function outward(tool: Tool) {
  return (
    tool === "place" || tool === "spawn" || tool === "goal" || tool === "checkpoint"
  );
}

/**
 * Tools a drag must not repeat.
 *
 * Dragging any of these would spam the undo stack with one action per cell
 * crossed — and for prop, one new instance per pixel moved; for checkpoint, a
 * course whose sixty-four gates were all laid down in one flick of the wrist.
 */
function singleShot(tool: Tool) {
  return (
    tool === "spawn" ||
    tool === "pick" ||
    tool === "prop" ||
    tool === "goal" ||
    tool === "checkpoint"
  );
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

  const camera = useThree((s) => s.camera);
  const look = useRef(new THREE.Vector3());

  /**
   * Which way a run resumes from a checkpoint placed at `cell`.
   *
   * The author's own view, because that is the one direction they have already
   * expressed an opinion about: they orbited round to look at the jump they
   * are marking, and that is the way the runner needs to be looking when they
   * come back to it. `Trail.mark()` gets the same answer from the next hop,
   * which the editor cannot use — when you place gate N, gate N+1 does not
   * exist yet.
   *
   * The fallback matters more than it looks. A builder working from straight
   * overhead — the natural view for laying out a route — has a camera whose
   * horizontal direction is nearly zero, and `atan2` on that returns a
   * confident answer built out of rounding error. So below a threshold, use
   * the direction the course itself travels: from the last marker to this one.
   */
  const resumeYaw = useCallback(
    (cell: [number, number, number]) => {
      camera.getWorldDirection(look.current);
      const { x, z } = look.current;
      if (x * x + z * z > 0.02) return yawTowards(x, z);

      const s = useEditorStore.getState();
      const from = s.checkpoints.at(-1)?.pos ?? s.spawn;
      const dx = cell[0] + 0.5 - from[0];
      const dz = cell[2] + 0.5 - from[2];
      // A gate placed on the spawn itself has no direction to offer; leave it
      // at the default rather than inventing one from noise.
      return dx * dx + dz * dz > 0.02 ? yawTowards(dx, dz) : 0;
    },
    [camera]
  );

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

      // Props are free-standing, not grid-snapped, so they skip the cell
      // machinery entirely and place straight at the raycast hit point.
      // Selecting an *existing* prop is handled by PlacedProps' own
      // onPointerDown (with stopPropagation) before this ever runs.
      if (s.tool === "prop") {
        if (!inBounds([Math.floor(e.point.x), 0, Math.floor(e.point.z)])) return;
        s.placeProp([e.point.x, e.point.y, e.point.z]);
        return;
      }

      const cell = cellFor(e, outward(s.tool));
      if (!inBounds(cell)) return;

      const key = `${cell[0]},${cell[1]},${cell[2]}`;
      if (lastCell.current === key) return;
      lastCell.current = key;

      if (s.tool === "spawn") {
        s.setSpawn(cell);
        sfxSpawn();
      } else if (s.tool === "goal") {
        s.setGoal(cell);
        sfxSpawn();
      } else if (s.tool === "checkpoint") {
        // Read the count back rather than trusting the call: at the cap,
        // addCheckpoint is a no-op and a confirmation sound would be a lie.
        const before = s.checkpoints.length;
        s.addCheckpoint(cell, resumeYaw(cell));
        if (useEditorStore.getState().checkpoints.length !== before) sfxSpawn();
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
    [cellFor, resumeYaw]
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // Ignore fingers that are not the one that started the stroke.
      if (strokeId.current !== null && e.pointerId !== strokeId.current) return;

      const s = useEditorStore.getState();
      const cell = cellFor(e, outward(s.tool));
      s.setHoverCell(inBounds(cell) ? cell : null);

      if (painting.current && !singleShot(useEditorStore.getState().tool)) {
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
      // Middle-click picks, whatever tool is armed. It is the eyedropper
      // shortcut every block game has, and it works from inside a build
      // stroke: reaching for the palette to copy a colour you are looking at
      // is the single most common interruption to a build.
      if (e.button === 1) {
        const s = useEditorStore.getState();
        if (s.readOnly || s.tool === "prop") return;
        const cell = cellFor(e, false);
        if (!inBounds(cell)) return;
        e.stopPropagation();
        s.pick(cell);
        return;
      }

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
    [applyAt, cellFor, endStroke]
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
