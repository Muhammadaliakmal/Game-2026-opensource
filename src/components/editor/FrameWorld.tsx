"use client";

import * as THREE from "three";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "@/stores/editor-store";

/**
 * F fits the whole build in view.
 *
 * Without it, the only way back from "I zoomed into a corner of a 90-unit
 * course" is a long scroll and a lot of panning — and the build plane is now
 * 192 units across, so getting lost on it is easy.
 *
 * The current viewing ANGLE is preserved and only the distance and target
 * change, so framing never disorients: the world you were looking at is still
 * oriented the way you left it, just fully visible.
 */
export function FrameWorld() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!controls) return;

    const frame = () => {
      const parts = useEditorStore.getState().parts;

      const box = new THREE.Box3();
      if (parts.size === 0) {
        // Nothing built yet: frame a sensible patch of ground around the origin.
        box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 1, 8));
      } else {
        const lo = new THREE.Vector3();
        const hi = new THREE.Vector3();
        for (const p of parts.values()) {
          box.expandByPoint(lo.set(p[0], p[1], p[2]));
          box.expandByPoint(hi.set(p[0] + 1, p[1] + 1, p[2] + 1));
        }
      }

      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const perspective = camera as THREE.PerspectiveCamera;
      const fov = ((perspective.fov ?? 50) * Math.PI) / 180;
      // 1.15 leaves a little air around the build instead of cropping it flush.
      const distance = (sphere.radius * 1.15) / Math.sin(fov / 2);

      // Keep the direction we are already looking from.
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
      dir.normalize();

      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(dir, distance);
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      frame();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, controls, invalidate]);

  return null;
}
