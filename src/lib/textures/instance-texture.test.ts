import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ownedGeometry, writeInstanceTextures } from "./instance-texture";
import { TEXTURE_ATTRIBUTE } from "./block-shader";
import type { PartTuple } from "@/lib/worlddoc";

test("an owned geometry carries its own surface attribute and shares nothing", () => {
  const shared = new THREE.BoxGeometry(1, 1, 1);
  const a = ownedGeometry(shared, 8);
  const b = ownedGeometry(shared, 8);

  // The shared geometry is untouched — writing the attribute onto it would
  // hand every bucket the last bucket's layers.
  assert.equal(shared.getAttribute(TEXTURE_ATTRIBUTE), undefined);

  const attrA = a.getAttribute(TEXTURE_ATTRIBUTE) as THREE.InstancedBufferAttribute;
  const attrB = b.getAttribute(TEXTURE_ATTRIBUTE) as THREE.InstancedBufferAttribute;
  assert.ok(attrA instanceof THREE.InstancedBufferAttribute);
  assert.notEqual(attrA.array, attrB.array);
  assert.equal(attrA.count, 8);
  assert.equal(attrA.itemSize, 1);
});

test("writeInstanceTextures writes each part's surface, treating a missing field as plain", () => {
  const g = ownedGeometry(new THREE.BoxGeometry(1, 1, 1), 4);
  const parts: PartTuple[] = [
    [0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 3],
    [2, 0, 0, 0, 0, 0, 0, 10],
  ];
  writeInstanceTextures(g, parts);
  const attr = g.getAttribute(TEXTURE_ATTRIBUTE) as THREE.InstancedBufferAttribute;
  assert.deepEqual([...(attr.array as Float32Array)].slice(0, 3), [0, 3, 10]);
  assert.equal(attr.needsUpdate || attr.version > 0, true);
});
