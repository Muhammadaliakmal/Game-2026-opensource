"use client";

import * as THREE from "three";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useNetStore } from "@/stores/net-store";
import { peerMap, samplePeer } from "@/lib/net/peers";
import { CharacterModel, type AvatarMotion } from "./CharacterModel";

/**
 * Everyone else, in Play mode.
 *
 * Which peers exist is React state; where they are is not — the transforms
 * come straight out of the peer map in a frame loop, so a packet arriving
 * twelve times a second never re-renders the tree.
 *
 * Peers are cosmetic: no rigid body, no collider, nothing physics can feel.
 * Two players cannot push each other around, which is the correct v1 answer —
 * shared physics needs server-authoritative movement, and guessing at it
 * produces the rubber-banding that makes a world feel broken.
 */
export function Peers() {
  const peerIds = useNetStore((s) => s.peerIds);
  if (peerIds.length === 0) return null;
  return (
    <>
      {peerIds.map((id) => (
        <PeerAvatar key={id} id={id} />
      ))}
    </>
  );
}

function PeerAvatar({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  // Mutated in place each frame and handed to CharacterModel, which reads it
  // exactly as the local player's EcctrlHandle is read.
  const motion = useRef<AvatarMotion>({
    moveSpeed: 0,
    isOnGround: true,
    verticalSpeed: 0,
  });
  // Read once at mount: a peer's display name never changes for the life of
  // their session, so this is state, not a per-frame value.
  const [label] = useState(() => peerMap().get(id)?.name ?? "Builder");

  useFrame(() => {
    const peer = peerMap().get(id);
    const g = group.current;
    if (!peer || !g) return;

    // Someone in Build mode is present in the room but not standing anywhere
    // in the world — showing their avatar frozen at the spawn point would be a
    // lie about where they are.
    g.visible = !peer.building;
    if (!g.visible) return;

    const m = samplePeer(peer, Date.now());
    g.position.set(m.x, m.y, m.z);
    g.rotation.y = m.yaw;
    motion.current.moveSpeed = m.moveSpeed;
    motion.current.verticalSpeed = m.verticalSpeed;
    motion.current.isOnGround = m.isOnGround;
  });

  return (
    <group ref={group}>
      <CharacterModel motionRef={motion} hideUpClose={false} />
      {/* A DOM label rather than 3D text: troika would fetch a font over the
          network on first render, and a name tag is not worth a request that
          can fail. */}
      <Html center position={[0, 1.15, 0]} distanceFactor={12} zIndexRange={[10, 0]}>
        <span className="hud-label bg-steel-900/80 rounded px-1.5 py-0.5 whitespace-nowrap text-white/90">
          {label}
        </span>
      </Html>
    </group>
  );
}
