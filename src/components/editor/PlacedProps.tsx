"use client";

import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Instance, Instances, useGLTF } from "@react-three/drei";
import { useEditorStore } from "@/stores/editor-store";
import { PROP_BY_ID } from "@/lib/props-catalog";
import { firstMesh } from "@/lib/gltf-mesh";
import type { PropInstance } from "@/lib/worlddoc";

/**
 * Renders every catalog GLB actually in use as one drei `<Instances>` batch
 * per assetId — SPEC §7.3 calls this out as the right tool specifically for
 * the props catalog (unlike the voxel grid): instances here change on user
 * clicks, not per pointer-move, so normal React reconciliation is fine.
 *
 * gltf-pipeline.ts joins every prop down to a single mesh, so there is
 * exactly one geometry/material pair per catalog entry to instance.
 */
function PropGroup({
  assetId,
  instances,
  interactive,
}: {
  assetId: string;
  instances: PropInstance[];
  interactive: boolean;
}) {
  const entry = PROP_BY_ID.get(assetId)!;
  const gltf = useGLTF(entry.url);

  const mesh = useMemo(() => firstMesh(gltf.scene), [gltf]);

  if (!mesh) return null;

  const select = (e: ThreeEvent<PointerEvent>, instance: PropInstance) => {
    if (useEditorStore.getState().tool !== "prop") return;
    // Selecting an existing prop is not the same click as placing a new one
    // on the ground behind it — Builder's own handler must not also fire.
    e.stopPropagation();
    useEditorStore.getState().selectProp(instance);
  };

  return (
    <Instances geometry={mesh.geometry} material={mesh.material} castShadow receiveShadow>
      {instances.map((instance, i) => (
        <Instance
          key={i}
          position={instance.pos}
          rotation={instance.rot}
          scale={instance.scale}
          onPointerDown={interactive ? (e) => select(e, instance) : undefined}
        />
      ))}
    </Instances>
  );
}

export function PlacedProps({
  props,
  exclude,
  interactive = false,
}: {
  props: PropInstance[];
  /** Omitted from the batch — PropGizmo renders this one instead, so a prop
   * being dragged isn't drawn twice. */
  exclude?: PropInstance | null;
  interactive?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, PropInstance[]>();
    for (const p of props) {
      if (p === exclude) continue;
      // A catalog entry can be removed after a world was saved with it —
      // skip rather than crash on a stale assetId.
      if (!PROP_BY_ID.has(p.assetId)) continue;
      const arr = map.get(p.assetId);
      if (arr) arr.push(p);
      else map.set(p.assetId, [p]);
    }
    return [...map.entries()];
  }, [props, exclude]);

  return (
    <>
      {groups.map(([assetId, group]) => (
        <PropGroup key={assetId} assetId={assetId} instances={group} interactive={interactive} />
      ))}
    </>
  );
}
