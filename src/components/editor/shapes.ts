import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The four buildable shapes, as geometries centred on the cell origin so each
 * spans -0.5..+0.5. InstancedParts positions instances at cell centre
 * (cell + 0.5), so anything centred here lands exactly inside its cell.
 *
 * Built once at module load and shared across every instance — creating
 * geometry per block is the fast path to a blown memory budget.
 *
 * Every shape is chamfered. A hard-edged cube reads as a flat silhouette
 * because its edges catch no light; a small bevel gives each edge a highlight,
 * which is what separates neighbouring blocks of the same colour and makes the
 * whole build look modelled rather than blocked out. The chamfer is kept well
 * under half a cell so blocks still tile as a continuous surface.
 */

const BEVEL = 0.045;

/** Chamfered cube. */
function makeBlock(): THREE.BufferGeometry {
  return new RoundedBoxGeometry(1, 1, 1, 2, BEVEL);
}

/** Half-height, sitting on the cell floor. */
function makeSlab(): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(1, 0.5, 1, 2, BEVEL);
  g.translate(0, -0.25, 0);
  return g;
}

/** Triangular prism: floor at -x rising to full height at +x. */
function makeRamp(): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(-0.5, -0.5);
  profile.lineTo(0.5, -0.5);
  profile.lineTo(0.5, 0.5);
  profile.closePath();

  const g = new THREE.ExtrudeGeometry(profile, {
    depth: 1 - BEVEL * 2,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
  });
  // ExtrudeGeometry builds from z=0 forward; recentre it on the cell.
  g.translate(0, 0, -0.5 + BEVEL);
  g.computeVertexNormals();
  return g;
}

/**
 * Corner wedge — a tetrahedron that slopes down in two directions at once, so
 * ramps can turn corners. Built by hand because no three.js primitive matches.
 */
function makeWedge(): THREE.BufferGeometry {
  const a = [-0.5, -0.5, -0.5]; // floor, back-left
  const b = [0.5, -0.5, -0.5]; // floor, back-right
  const c = [-0.5, -0.5, 0.5]; // floor, front-left
  const d = [-0.5, 0.5, -0.5]; // apex, above back-left

  // Wound counter-clockwise when viewed from outside so normals face outward.
  const tris = [
    [a, c, b], // floor
    [a, b, d], // back
    [a, d, c], // left
    [b, c, d], // the sloped hypotenuse face
  ];

  const positions = new Float32Array(tris.flat(2));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export const SHAPE_GEOMETRIES: THREE.BufferGeometry[] = [
  makeBlock(),
  makeSlab(),
  makeRamp(),
  makeWedge(),
];

/**
 * Physics uses plain boxes, not the chamfered render geometry.
 *
 * Rapier gets its cube colliders from the greedy mesher, but the non-cube
 * shapes are fed real geometry — and a bevelled trimesh is both heavier and
 * subtly rounded at the lip, which makes a character standing on the edge slide
 * off. These un-bevelled twins keep collision crisp.
 */
export const COLLIDER_GEOMETRIES: THREE.BufferGeometry[] = [
  new THREE.BoxGeometry(1, 1, 1),
  (() => {
    const g = new THREE.BoxGeometry(1, 0.5, 1);
    g.translate(0, -0.25, 0);
    return g;
  })(),
  (() => {
    const profile = new THREE.Shape();
    profile.moveTo(-0.5, -0.5);
    profile.lineTo(0.5, -0.5);
    profile.lineTo(0.5, 0.5);
    profile.closePath();
    const g = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })(),
  makeWedge(),
];

export const SHAPE_NAMES = ["Block", "Slab", "Ramp", "Wedge"] as const;

/**
 * Material parameters per finish index, matching FINISHES in worlddoc.ts:
 * matte / glossy / metal / emissive.
 *
 * Values are tuned against the scene's room environment map — without one,
 * `metal` in particular renders as a flat dark patch because there is nothing
 * for it to reflect.
 */
export const FINISH_PARAMS: Array<{
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
}> = [
  { roughness: 0.85, metalness: 0.05, emissiveIntensity: 0 }, // matte
  { roughness: 0.12, metalness: 0.2, emissiveIntensity: 0 }, // glossy
  { roughness: 0.22, metalness: 1.0, emissiveIntensity: 0 }, // metal
  { roughness: 0.5, metalness: 0.0, emissiveIntensity: 1.4 }, // emissive
];
