"use client";

import * as THREE from "three";
import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { PivotControls, useGLTF } from "@react-three/drei";
import { useEditorStore } from "@/stores/editor-store";
import { PROP_BY_ID, type PropCatalogEntry } from "@/lib/props-catalog";
import { firstMesh } from "@/lib/gltf-mesh";
import type { PropInstance } from "@/lib/worlddoc";

/**
 * Free-transform placement (SPEC §12 Phase 3): PivotControls handles for
 * whichever placed prop is selected. Rendered separately from PlacedProps
 * (which excludes this same instance) so there's exactly one mesh for it on
 * screen, driven by drag deltas instead of duplicated.
 *
 * Split into an outer/inner pair so `useGLTF` — which needs a real URL — is
 * only ever mounted once there's an actual instance+catalog entry to show;
 * the far more common "nothing selected" case never calls it at all.
 */
export function PropGizmo() {
  const selectedProp = useEditorStore((s) => s.selectedProp);
  const props = useEditorStore((s) => s.props);

  // Re-read from the live array rather than trusting the subscribed
  // `selectedProp` directly — an unrelated undo/redo can remove the instance
  // it points to (see command-bus.ts's ref-identity note), and this is the
  // one place that would otherwise render handles for a prop that's gone.
  const live = selectedProp && props.includes(selectedProp) ? selectedProp : null;
  const entry = live ? PROP_BY_ID.get(live.assetId) : undefined;

  if (!live || !entry) return null;
  return <PropGizmoActive live={live} entry={entry} />;
}

function PropGizmoActive({
  live,
  entry,
}: {
  live: PropInstance;
  entry: PropCatalogEntry;
}) {
  // Keyed off this, not the ever-changing `selectedProp` reference (see
  // editor-store.ts) — a drag reassigns that every frame, and remounting
  // PivotControls mid-drag would cancel the gesture.
  const epoch = useEditorStore((s) => s.selectionEpoch);
  const invalidate = useThree((st) => st.invalidate);

  const gltf = useGLTF(entry.url);
  const mesh = useMemo(() => firstMesh(gltf.scene), [gltf]);

  if (!mesh) return null;

  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...live.pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...live.rot)),
    new THREE.Vector3(...live.scale)
  );

  return (
    <PivotControls
      key={epoch}
      matrix={matrix}
      scale={0.9}
      depthTest={false}
      onDragStart={() => useEditorStore.getState().beginPropDrag()}
      onDrag={(l) => {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        l.decompose(pos, quat, scale);
        const rot = new THREE.Euler().setFromQuaternion(quat);
        useEditorStore.getState().updatePropLive({
          assetId: live.assetId,
          pos: [pos.x, pos.y, pos.z],
          rot: [rot.x, rot.y, rot.z],
          scale: [scale.x, scale.y, scale.z],
        });
        invalidate();
      }}
      onDragEnd={() => useEditorStore.getState().endPropDrag()}
    >
      <mesh geometry={mesh.geometry} material={mesh.material} castShadow receiveShadow />
    </PivotControls>
  );
}
