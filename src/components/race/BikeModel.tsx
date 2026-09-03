"use client";

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The bike, as geometry only.
 *
 * Procedural like the character avatar and for the same reason: no asset
 * pipeline, and it can be tinted per rider from one shared set of shapes.
 *
 * Forward is +Z, matching the vehicle body — ecctrl steers the front wheels of
 * whatever sits at positive Z, so a model facing the other way would lean into
 * corners backwards. (The on-foot avatar is built facing -Z and flipped; this
 * one is simply built the right way round, because nothing here was inherited.)
 *
 * Nothing in this file touches physics. The two visible wheels are decoration:
 * the vehicle underneath runs on four narrow contact points, which is what
 * keeps a two-wheeler upright without a stabiliser fighting the rider. See
 * Bike.tsx.
 */

// Shared across every bike on the grid — one allocation per shape, ever.
const G = {
  chassis: new RoundedBoxGeometry(0.34, 0.26, 1.5, 3, 0.09),
  tank: new RoundedBoxGeometry(0.32, 0.3, 0.6, 3, 0.1),
  seat: new RoundedBoxGeometry(0.3, 0.12, 0.5, 2, 0.05),
  fairing: new RoundedBoxGeometry(0.36, 0.34, 0.4, 3, 0.12),
  wheel: new THREE.TorusGeometry(0.33, 0.1, 10, 20),
  hub: new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10),
  fork: new THREE.CylinderGeometry(0.045, 0.045, 0.62, 8),
  bar: new THREE.CylinderGeometry(0.03, 0.03, 0.52, 8),
  exhaust: new THREE.CylinderGeometry(0.06, 0.075, 0.7, 8),
  light: new THREE.SphereGeometry(0.09, 12, 12),
};

/** Wheels stand upright and roll about X, which a torus does not do by default. */
const WHEEL_ROT: [number, number, number] = [0, Math.PI / 2, 0];

/**
 * The parts whose colour never varies, shared like the geometries above.
 *
 * These were inline `<meshStandardMaterial>` children, which reads well but
 * builds a fresh material per bike: five bikes on a grid meant forty material
 * objects standing in for these six appearances. A material is a GPU state
 * change at draw time, and two meshes cannot be batched across one, so sharing
 * them is worth more than the seven lines it costs.
 */
const M = {
  seat: new THREE.MeshStandardMaterial({ color: "#1a1d21", roughness: 0.85 }),
  fork: new THREE.MeshStandardMaterial({
    color: "#c3c9d0",
    roughness: 0.25,
    metalness: 0.9,
  }),
  bar: new THREE.MeshStandardMaterial({
    color: "#4a525c",
    roughness: 0.4,
    metalness: 0.7,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.9 }),
  exhaust: new THREE.MeshStandardMaterial({
    color: "#8b93a0",
    roughness: 0.3,
    metalness: 0.9,
  }),
};

/**
 * Tinted materials, cached by what makes them different.
 *
 * This was a pair of `useMemo`s, which is one material per *bike* — `useMemo`
 * is scoped to a component instance, so the rider's cyan bike and a rival's
 * cyan bike each built their own, and neither was ever disposed. A module-level
 * cache is what the intent was: the palette is four colours and two emissive
 * settings, so this holds at most a handful of entries for the life of the tab.
 */
const tinted = new Map<string, THREE.MeshStandardMaterial>();

function paintFor(color: string): THREE.MeshStandardMaterial {
  const key = `paint:${color}`;
  let m = tinted.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
    tinted.set(key, m);
  }
  return m;
}

function glowFor(color: string, emissive: number): THREE.MeshStandardMaterial {
  const key = `glow:${color}:${emissive}`;
  let m = tinted.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: emissive,
      toneMapped: false,
    });
    tinted.set(key, m);
  }
  return m;
}

export function BikeModel({
  /** Body colour, so four riders on a grid are told apart at a glance. */
  color = "#22d3ee",
  /** Dims the rider's own bike is never wanted; peers use the default. */
  emissive = 1.8,
}: {
  color?: string;
  emissive?: number;
}) {
  const paint = paintFor(color);
  const glow = glowFor(color, emissive);

  return (
    // Dropped so the wheels meet the ground rather than the body origin: the
    // vehicle's origin sits at axle height, and the wheels have radius 0.33.
    <group position={[0, -0.12, 0]}>
      {/* ── Frame ── */}
      <mesh geometry={G.chassis} material={paint} position={[0, 0.1, 0]} castShadow />
      <mesh geometry={G.tank} material={paint} position={[0, 0.28, 0.16]} castShadow />
      <mesh geometry={G.seat} material={M.seat} position={[0, 0.34, -0.34]} castShadow />
      <mesh geometry={G.fairing} material={paint} position={[0, 0.26, 0.6]} castShadow />

      {/* Headlight, so a bike behind you in a mirrorless game is still readable
          as pointing at you rather than away. */}
      <mesh geometry={G.light} material={glow} position={[0, 0.28, 0.8]} />

      {/* ── Front end ── */}
      <mesh
        geometry={G.fork}
        material={M.fork}
        position={[-0.12, 0.12, 0.66]}
        rotation={[0.35, 0, 0]}
      />
      <mesh
        geometry={G.fork}
        material={M.fork}
        position={[0.12, 0.12, 0.66]}
        rotation={[0.35, 0, 0]}
      />
      <mesh
        geometry={G.bar}
        material={M.bar}
        position={[0, 0.46, 0.52]}
        rotation={[0, 0, Math.PI / 2]}
      />

      {/* ── Wheels ── */}
      {([0.78, -0.72] as const).map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={G.wheel} material={M.tyre} rotation={WHEEL_ROT} castShadow />
          <mesh geometry={G.hub} material={glow} rotation={[0, 0, Math.PI / 2]} />
        </group>
      ))}

      {/* ── Exhaust ── */}
      <mesh
        geometry={G.exhaust}
        material={M.exhaust}
        position={[0.16, 0.02, -0.5]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

/**
 * Grid colours, in slot order.
 *
 * Four distinguishable hues rather than a palette index: a rider needs to know
 * which bike is theirs in a mirror-image field, and "the cyan one" is the only
 * thing that survives being glanced at through a corner.
 */
export const BIKE_COLORS = ["#22d3ee", "#ffb020", "#a3e635", "#f472b6"] as const;

/** Stable per rider, so a bike does not change colour when somebody leaves. */
export function bikeColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return BIKE_COLORS[Math.abs(h) % BIKE_COLORS.length]!;
}
