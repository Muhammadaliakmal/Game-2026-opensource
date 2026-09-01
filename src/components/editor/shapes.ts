import * as THREE from "three";

/**
 * The four buildable shapes, as geometries centred on the cell origin so each
 * spans -0.5..+0.5. InstancedParts positions instances at cell centre
 * (cell + 0.5), so anything centred here lands exactly inside its cell.
 *
 * Built once at module load and shared across every instance — creating
 * geometry per block is the fast path to a blown memory budget.
 */

function makeBlock(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** Half-height, sitting on the cell floor. */
function makeSlab(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 0.5, 1);
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
    depth: 1,
    bevelEnabled: false,
  });
  // ExtrudeGeometry builds from z=0 forward; recentre it on the cell.
  g.translate(0, 0, -0.5);
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

export const SHAPE_NAMES = ["Block", "Slab", "Ramp", "Wedge"] as const;

/**
 * Material parameters per finish index, matching FINISHES in worlddoc.ts:
 * matte / glossy / metal / emissive.
 */
export const FINISH_PARAMS: Array<{
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
}> = [
  { roughness: 0.95, metalness: 0.0, emissiveIntensity: 0 }, // matte
  { roughness: 0.15, metalness: 0.0, emissiveIntensity: 0 }, // glossy
  { roughness: 0.3, metalness: 0.9, emissiveIntensity: 0 }, // metal
  { roughness: 0.6, metalness: 0.0, emissiveIntensity: 0.8 }, // emissive
];
