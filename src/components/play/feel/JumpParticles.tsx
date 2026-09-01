"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";

/**
 * Dust puffs kicked up on takeoff and on a hard landing.
 *
 * One pooled `THREE.Points` with a fixed buffer — spawning a mesh per mote is
 * the fast path to a blown draw-call budget, and this is pure eye candy that
 * must never cost a frame. Dead motes are parked far below the world and
 * recycled by a ring cursor.
 *
 * "particle-on-impact" is one of the core juice layers from the game-feel
 * canon (Vlambeer's "The Art of Screenshake"): tiny, brief, and it sells
 * weight far out of proportion to its cost.
 *
 * Render reads only the two memoised attribute arrays; every per-frame write
 * goes through the Points ref (`pts.geometry.attributes…`), matching how the
 * instanced renderers in this codebase mutate their buffers.
 */

const MAX = 96;
const GRAVITY = 9.8;
const PARKED_Y = -9999;

// Fades a mote by lerping its colour toward the sky as it ages — a cheap stand
// in for per-particle alpha, which PointsMaterial can't do without a shader.
const DUST = new THREE.Color("#cbd5e1");
const SKY = new THREE.Color("#0b1120");

function makeSim() {
  return {
    vel: new Float32Array(MAX * 3),
    age: new Float32Array(MAX).fill(FEEL.particleLife),
    cursor: 0,
    wasOnGround: true,
    wasJumping: false,
    tmp: new THREE.Color(),
  };
}

export function JumpParticles({
  handleRef,
}: {
  handleRef: RefObject<EcctrlHandle | null>;
}) {
  const points = useRef<THREE.Points>(null!);
  const sim = useRef(makeSim());

  const buffers = useMemo(() => {
    const positions = new Float32Array(MAX * 3);
    const colors = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = PARKED_Y;
    return { positions, colors };
  }, []);

  useFrame((_, dtRaw) => {
    const h = handleRef.current;
    const pts = points.current;
    if (!h || !pts) return;

    const s = sim.current;
    const dt = Math.min(dtRaw, 1 / 30); // clamp so a stall can't fling motes
    const pos = (pts.geometry.attributes.position.array as Float32Array);
    const col = (pts.geometry.attributes.color.array as Float32Array);

    const spawn = (count: number, spread: number) => {
      const fx = h.currPos.x;
      const fy = h.currPos.y - 0.55; // roughly the feet
      const fz = h.currPos.z;
      for (let n = 0; n < count; n++) {
        const i = s.cursor;
        s.cursor = (s.cursor + 1) % MAX;

        pos[i * 3 + 0] = fx + (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 1] = fy;
        pos[i * 3 + 2] = fz + (Math.random() - 0.5) * 0.3;

        // Outward hemisphere: mostly sideways, a little up.
        const a = Math.random() * Math.PI * 2;
        const r = FEEL.particleSpeed * spread * (0.4 + Math.random() * 0.6);
        s.vel[i * 3 + 0] = Math.cos(a) * r;
        s.vel[i * 3 + 1] = Math.random() * FEEL.particleSpeed * 0.6;
        s.vel[i * 3 + 2] = Math.sin(a) * r;

        s.age[i] = 0;
      }
    };

    // Takeoff: jumpActive rising edge.
    if (h.jumpActive && !s.wasJumping) spawn(FEEL.jumpBurst, 1);
    s.wasJumping = h.jumpActive;

    // Hard landing: back on the ground with real downward speed.
    const landedHard =
      h.isOnGround &&
      !s.wasOnGround &&
      Math.abs(h.verticalSpeed) > FEEL.hardLandVel;
    if (landedHard) spawn(FEEL.landBurst, 1.6);
    s.wasOnGround = h.isOnGround;

    // Integrate + fade.
    let anyLive = false;
    for (let i = 0; i < MAX; i++) {
      if (s.age[i] >= FEEL.particleLife) continue;
      anyLive = true;
      s.age[i] += dt;

      s.vel[i * 3 + 1] -= GRAVITY * dt;
      pos[i * 3 + 0] += s.vel[i * 3 + 0] * dt;
      pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;

      const life = s.age[i] / FEEL.particleLife;
      if (life >= 1) {
        pos[i * 3 + 1] = PARKED_Y;
        continue;
      }
      s.tmp.copy(DUST).lerp(SKY, life);
      col[i * 3 + 0] = s.tmp.r;
      col[i * 3 + 1] = s.tmp.g;
      col[i * 3 + 2] = s.tmp.b;
    }

    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
    pts.visible = anyLive;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[buffers.positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}
