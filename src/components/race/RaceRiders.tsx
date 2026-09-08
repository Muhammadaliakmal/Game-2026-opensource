"use client";

import * as THREE from "three";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useNetStore } from "@/stores/net-store";
import { peerMap, samplePeer } from "@/lib/net/peers";
import { BikeModel, bikeColor } from "./BikeModel";
import { Rider } from "./Rider";

/**
 * Everyone else on the grid.
 *
 * The same shape as play/Peers.tsx and deliberately so — which peers exist is
 * React state, where they are is not, and the transforms come straight out of
 * the peer map in a frame loop so a packet arriving twelve times a second never
 * re-renders the tree.
 *
 * Rivals are cosmetic: no rigid body, no collider, nothing physics can feel.
 * Two bikes cannot touch. That is the correct answer for a v1 for exactly the
 * reason Peers gives — shared physics needs server-authoritative movement, and
 * guessing at it produces rubber-banding — and it matters more here, because
 * two cars trading a collision they each simulated differently end up in
 * different places on different screens, which in a race decides the result.
 */
export function RaceRiders() {
  const peerIds = useNetStore((s) => s.peerIds);
  if (peerIds.length === 0) return null;
  return (
    <>
      {peerIds.map((id) => (
        <RivalBike key={id} id={id} />
      ))}
    </>
  );
}

function RivalBike({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const [label] = useState(() => peerMap().get(id)?.name ?? "Rider");
  const [color] = useState(() => bikeColor(id));
  /**
   * A rival's speed, and unlike their steering this one is not invented: it
   * falls out of the interpolated positions that are already on the wire (see
   * `samplePeer`), in the same units the local bike reports. So a rival tucks
   * down the straights and sits up under braking for the same reason the
   * player does — because they are actually going that fast.
   */
  const speed = useRef(0);

  useFrame(() => {
    const peer = peerMap().get(id);
    const g = group.current;
    if (!peer || !g) return;

    const m = samplePeer(peer, Date.now());
    g.position.set(m.x, m.y, m.z);
    speed.current = m.moveSpeed;
    // A rider reports the yaw its own body is pointing (see Bike.tsx), and the
    // model's forward is +Z, which a group rotation of theta points along. So
    // unlike the on-foot avatar — whose yaw is a camera angle and needs half a
    // turn — this one is used exactly as sent.
    g.rotation.y = m.yaw;
  });

  return (
    <group ref={group}>
      <BikeModel color={color} />
      {/* No steer ref: a rival's steering is not on the wire — only where they
          are and which way they point — so they do not lean off a number
          invented on this machine. Speed is a different case: it is measured
          from the positions that ARE on the wire, so the tuck is real. */}
      <Rider color={color} speedRef={speed} />
      {/* A DOM label rather than 3D text, for the same reason Peers gives:
          troika would fetch a font over the network on first render. */}
      <Html center position={[0, 1.5, 0]} distanceFactor={14} zIndexRange={[10, 0]}>
        <span className="hud-label bg-base/80 rounded px-1.5 py-0.5 whitespace-nowrap text-white/90">
          {label}
        </span>
      </Html>
    </group>
  );
}
