import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SHAPE_GEOMETRIES, COLLIDER_GEOMETRIES, SHAPE_NAMES } from "./shapes";

/**
 * Winding regression.
 *
 * The wedge is built by hand from four triangles, and every one of them was
 * wound the wrong way round: `computeVertexNormals()` then pointed all four
 * normals INTO the solid, so the shape rendered inside-out — front faces
 * culled, and the faces that did draw lit from within. Nothing in the type
 * system or the renderer complains about that, so it needs a test.
 */

/** Every triangle's normal should point away from the shape's own centroid. */
function facesPointOutward(geom: THREE.BufferGeometry): boolean {
  const position = geom.getAttribute("position");
  const normal = geom.getAttribute("normal");
  if (!normal) return false;

  // Centroid of all vertices — inside any convex solid.
  const centre = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    centre.add(
      new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i))
    );
  }
  centre.multiplyScalar(1 / position.count);

  const face = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let t = 0; t < position.count / 3; t++) {
    const i = t * 3;
    face.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      face.add(
        new THREE.Vector3(
          position.getX(i + k),
          position.getY(i + k),
          position.getZ(i + k)
        )
      );
    }
    face.multiplyScalar(1 / 3);

    n.set(normal.getX(i), normal.getY(i), normal.getZ(i));
    // A degenerate/zero normal is also a failure worth catching.
    if (n.lengthSq() < 1e-6) return false;
    if (n.dot(face.clone().sub(centre).normalize()) <= 0) return false;
  }
  return true;
}

test("the wedge is not inside-out", () => {
  assert.equal(facesPointOutward(SHAPE_GEOMETRIES[3]), true);
  assert.equal(facesPointOutward(COLLIDER_GEOMETRIES[3]), true);
});

test("every shape has geometry and a collider twin", () => {
  assert.equal(SHAPE_GEOMETRIES.length, SHAPE_NAMES.length);
  assert.equal(COLLIDER_GEOMETRIES.length, SHAPE_NAMES.length);
  for (let i = 0; i < SHAPE_GEOMETRIES.length; i++) {
    assert.ok(SHAPE_GEOMETRIES[i].getAttribute("position").count > 0);
    assert.ok(COLLIDER_GEOMETRIES[i].getAttribute("position").count > 0);
  }
});

test("every shape stays inside its own cell", () => {
  // A shape that spilled past ±0.5 would collide with its neighbours and
  // break the "one cell, one block" assumption the whole grid rests on.
  for (let i = 0; i < SHAPE_GEOMETRIES.length; i++) {
    const geom = SHAPE_GEOMETRIES[i];
    geom.computeBoundingBox();
    const b = geom.boundingBox!;
    const slack = 1e-6;
    assert.ok(
      b.min.x >= -0.5 - slack &&
        b.min.y >= -0.5 - slack &&
        b.min.z >= -0.5 - slack &&
        b.max.x <= 0.5 + slack &&
        b.max.y <= 0.5 + slack &&
        b.max.z <= 0.5 + slack,
      `${SHAPE_NAMES[i]} escapes its cell: ${JSON.stringify(b)}`
    );
  }
});
