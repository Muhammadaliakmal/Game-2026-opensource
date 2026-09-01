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

/**
 * Squeeze a geometry into exactly one cell, centred on the origin.
 *
 * ExtrudeGeometry's bevel grows the shape OUTWARD from its profile, and at a
 * sharp corner it grows by more than `bevelSize` (the offset runs along the
 * angle bisector). The ramp was overflowing its cell by ~0.06 units as a
 * result: it overlapped its neighbours and read as slightly too big next to a
 * block. Each axis is scaled independently, so the 45 degree slope survives —
 * x and y overflow by the same amount and are corrected by the same factor.
 */
function fitToCell(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  g.translate(-centre.x, -centre.y, -centre.z);
  g.scale(
    size.x > 0 ? 1 / size.x : 1,
    size.y > 0 ? 1 / size.y : 1,
    size.z > 0 ? 1 / size.z : 1
  );
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
  fitToCell(g);
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

  // Wound counter-clockwise seen from OUTSIDE, so computeVertexNormals() puts
  // every normal on the outside of the solid. Winding this the other way makes
  // the whole tetrahedron render inside-out: front faces get culled, so you see
  // straight through the wedge, and the faces that do draw are lit from within.
  const tris = [
    [a, b, c], // floor
    [a, d, b], // back
    [a, c, d], // left
    [b, d, c], // the sloped hypotenuse face
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

/** Index into FINISHES — the one finish that glows. */
export const EMISSIVE_FINISH = 3;

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

/**
 * The material for one (finish) bucket.
 *
 * Shared by both instanced renderers so the editor and Play can't drift apart.
 * Each caller owns the returned material and must dispose it on unmount —
 * R3F only auto-disposes what it created declaratively.
 *
 * The emissive patch is the interesting part. An InstancedMesh carries ONE
 * material and varies colour per instance through `instanceColor`, which three
 * wires into the diffuse term only — `material.emissive` stays a single
 * material-wide colour. So a bucket of glowing blocks in four different palette
 * colours used to render every block in whichever colour happened to be written
 * last. Multiplying the emissive term by the instance colour in the shader is
 * what lets each block glow in its own colour.
 */
export function createFinishMaterial(finish: number): THREE.MeshStandardMaterial {
  const p = FINISH_PARAMS[finish];
  const material = new THREE.MeshStandardMaterial({
    roughness: p.roughness,
    metalness: p.metalness,
    emissiveIntensity: p.emissiveIntensity,
  });

  if (finish === EMISSIVE_FINISH) {
    // White, so the multiply below is what decides the colour.
    material.emissive.setRGB(1, 1, 1);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
          totalEmissiveRadiance *= vColor;
        #endif`
      );
    };
    // A patched shader must not be served a cached program compiled from the
    // unpatched source.
    material.customProgramCacheKey = () => "blockworld-emissive-instanced";
  }

  return material;
}
