"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { PROP_BY_ID } from "@/lib/props-catalog";
import { propWorldAABB } from "@/lib/prop-bounds";
import type { PropInstance } from "@/lib/worlddoc";

/**
 * SPEC §12 Phase 3: "each placed prop has a walkable box collider in Play."
 *
 * One shared fixed body with a CuboidCollider per prop — the same pattern
 * WorldColliders uses for the voxel grid, for the same reason: colliders are
 * cheap to hang off one static body, and a RigidBody per prop is not.
 */
export function PropColliders({ props }: { props: PropInstance[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {props.map((instance, i) => {
        const entry = PROP_BY_ID.get(instance.assetId);
        // A world saved against a since-removed catalog entry shouldn't 500 —
        // it just walks through where that prop used to be.
        if (!entry) return null;
        const { center, half } = propWorldAABB(entry, instance);
        return <CuboidCollider key={i} args={half} position={center} />;
      })}
    </RigidBody>
  );
}
