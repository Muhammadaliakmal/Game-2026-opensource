import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { BONES, SEATED, jointsOf, poseSeated } from "./character-rig";
import { CHARACTERS } from "@/lib/characters";

/**
 * The rig, checked against the models it actually drives.
 *
 * A glTF's node hierarchy is plain JSON — names, translations, rotations — so
 * the whole skeleton can be built and posed in Node without a renderer, a
 * canvas or a browser. That matters because every claim this module makes is
 * geometric, and geometric claims are exactly the ones a type checker has no
 * opinion about: "the bones are called this", "the models face that way", "the
 * hands end up on the handlebars". Each of those is a silent, visible-only bug.
 *
 * The GLBs are Draco-compressed, which would matter if this needed vertices.
 * It does not — bones are nodes, and nodes are uncompressed JSON.
 */

/** Rebuild a glTF's node tree as three Object3Ds. No meshes, just the skeleton. */
function skeletonOf(file: string): { root: THREE.Object3D; byName: Map<string, THREE.Object3D> } {
  const buf = readFileSync(`public${file}`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const nodes: Record<string, unknown>[] = json.nodes ?? [];

  const objs = nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = (n.name as string) ?? "";
    if (n.matrix) {
      o.matrix.fromArray(n.matrix as number[]);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
    } else {
      if (n.translation) o.position.fromArray(n.translation as number[]);
      if (n.rotation) o.quaternion.fromArray(n.rotation as number[]);
      if (n.scale) o.scale.fromArray(n.scale as number[]);
    }
    return o;
  });
  nodes.forEach((n, i) => {
    for (const c of (n.children as number[]) ?? []) objs[i].add(objs[c]);
  });

  const root = new THREE.Group();
  for (const o of objs) if (!o.parent) root.add(o);
  root.updateMatrixWorld(true);

  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => byName.set(o.name, o));
  return { root, byName };
}

const RIGGED = CHARACTERS.filter((c) => c.url);

const at = (byName: Map<string, THREE.Object3D>, name: string) => {
  const o = byName.get(name);
  assert.ok(o, `${name} is missing`);
  const v = new THREE.Vector3();
  o.getWorldPosition(v);
  return v;
};

test("every shipped character has every bone the rig drives", () => {
  // The failure this prevents: a model exported from a renamed armature loads
  // fine, finds none of its bones, and stands perfectly still in the game while
  // everyone else walks. `jointsOf` skips what it cannot find, by design — so
  // nothing throws and nothing moves.
  assert.ok(RIGGED.length >= 3, "expected the shop characters to be rigged GLBs");
  for (const character of RIGGED) {
    const { byName } = skeletonOf(character.url!);
    for (const [key, bone] of Object.entries(BONES)) {
      assert.ok(byName.has(bone), `${character.id} has no ${bone} (for ${key})`);
    }
  }
});

test("the shipped characters face +Z, which is what FACE_SIGN is for", () => {
  // FACE_SIGN exists because these models face the opposite way from the
  // courier the gait is authored against, and getting that wrong tips a
  // running character backwards. It is a measurement, so it is measured:
  // toes lead the foot along +Z, and the LEFT leg is on +X. Both together are
  // a model facing +Z — either alone would also be true of a model lying down.
  for (const character of RIGGED) {
    const { byName } = skeletonOf(character.url!);
    const foot = at(byName, "foot.l");
    const toes = at(byName, "toes.l");
    assert.ok(
      toes.z > foot.z,
      `${character.id}: toes are not forward of the foot along +Z (${toes.z} vs ${foot.z})`
    );
    assert.ok(
      at(byName, "upperleg.l").x > 0,
      `${character.id}: the left leg is not on +X, so this model is mirrored`
    );
  }
});

test("the seated pose puts the hands forward and the legs folded", () => {
  /**
   * Forward kinematics over the real skeleton, which is the only way to check
   * a pose written as joint angles. The angles themselves say nothing readable
   * — `arm: -0.95` is not a claim anybody can check — but where the hands and
   * feet END UP is, and that is what a rider sitting on a bike means.
   *
   * The assertions are about direction and order rather than centimetres,
   * because the exact reach depends on the character's own proportions and all
   * three of them are different heights. What must be true of every one of them
   * is that they reach forward for the bars and fold their legs onto pegs.
   */
  for (const character of RIGGED) {
    const { root, byName } = skeletonOf(character.url!);
    const joints = jointsOf(root);
    poseSeated(joints, 0, 0);
    root.updateMatrixWorld(true);

    const hips = at(byName, "hips");
    const hand = at(byName, "hand.l");
    const foot = at(byName, "foot.l");
    const knee = at(byName, "lowerleg.l");
    const head = at(byName, "head");

    assert.ok(
      hand.z > hips.z + 0.1,
      `${character.id}: hands are not reaching forward (hand z ${hand.z.toFixed(2)}, hips ${hips.z.toFixed(2)})`
    );
    assert.ok(
      hand.y < head.y,
      `${character.id}: the hands are above the head, which is not riding a bike`
    );
    assert.ok(
      knee.z > hips.z + 0.1,
      `${character.id}: the knees are not ahead of the hips (knee z ${knee.z.toFixed(2)})`
    );
    assert.ok(
      foot.y < knee.y,
      `${character.id}: the feet are above the knees (foot y ${foot.y.toFixed(2)}, knee ${knee.y.toFixed(2)})`
    );
    assert.ok(
      foot.z > hips.z,
      `${character.id}: the feet are behind the hips, so this is a kneel rather than a ride`
    );
  }
});

test("tucking folds the chest and lifts the head, and moves nothing else", () => {
  // The tuck is the only part of the riding pose that animates, and the rule it
  // has to keep is that a rider folding down does not take their hands off the
  // bars or their feet off the pegs.
  const character = RIGGED[0];
  const upright = skeletonOf(character.url!);
  poseSeated(jointsOf(upright.root), 0, 0);
  upright.root.updateMatrixWorld(true);
  const uprightHead = at(upright.byName, "head").clone();
  const uprightHand = at(upright.byName, "hand.l").clone();

  const folded = skeletonOf(character.url!);
  poseSeated(jointsOf(folded.root), 1, 0.35);
  folded.root.updateMatrixWorld(true);

  const foldedHead = at(folded.byName, "head");
  const foldedHand = at(folded.byName, "hand.l");

  assert.ok(foldedHead.z > uprightHead.z, "a tucked rider's head should come forward");
  assert.ok(foldedHead.y < uprightHead.y, "and down");

  /**
   * The hands are on the bars, and the bars do not move — so the arms have to
   * absorb the fold rather than be carried by it.
   *
   * They cannot be pinned exactly: the shoulder is a child of the chest, so
   * folding the torso translates the whole arm even with its rotation
   * cancelled, and only a real IK solve would put the hand back to the
   * millimetre. What is checkable, and what actually reads on screen, is the
   * ratio — the head should travel several times as far as the hands. Without
   * the counter-rotation in `poseSeated` this fails: the hands move further
   * than the head does.
   */
  const headMoved = foldedHead.distanceTo(uprightHead);
  const handMoved = foldedHand.distanceTo(uprightHand);
  assert.ok(
    handMoved < headMoved / 2,
    `the hands came off the bars: they moved ${handMoved.toFixed(3)} against the head's ${headMoved.toFixed(3)}`
  );
  // And an absolute bound, because the ratio alone would pass a pose that threw
  // the whole rider forward. 45 mm on a 1.24-unit-tall character is a hand
  // sliding on the grip.
  assert.ok(handMoved < 0.05, `the hands travelled ${handMoved.toFixed(3)}`);
});

test("the seated angles are the ones the pose was checked with", () => {
  // A guard on the constants themselves. The geometric tests above pass for a
  // range of nearby values, so a casual retune can drift the pose without
  // failing anything — this makes a deliberate change look deliberate.
  assert.deepEqual(SEATED, {
    leg: -1.15,
    knee: 1.25,
    arm: -0.95,
    elbow: 0.3,
    chest: 0.3,
    head: -0.25,
  });
});
