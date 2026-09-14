import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TEXTURE, TEXTURES, parseWorldDoc, emptyWorldDoc, textureOf } from "./worlddoc";

test("parseWorldDoc accepts a valid empty WorldDoc", () => {
  const doc = emptyWorldDoc("00000000-0000-0000-0000-000000000000", "user_123", "My World");
  const parsed = parseWorldDoc(doc);
  assert.equal(parsed.name, "My World");
  assert.deepEqual(parsed.parts, []);
  assert.deepEqual(parsed.props, []);
});

test("parseWorldDoc rejects a malformed WorldDoc", () => {
  const malformed = {
    v: 1,
    id: "x",
    name: "", // violates min(1)
    ownerId: "user_123",
    spawn: [0, 1, 0],
    sky: 0,
    parts: [[0, 0, 0, 9, 0, 0, 0]], // shape 9 is out of range (max 3)
    props: [],
  };
  assert.throws(() => parseWorldDoc(malformed));
});

test("a part may carry a surface index, and one without is still valid", () => {
  // The eighth field is optional: every world saved before surfaces existed
  // is a seven-number tuple and must keep parsing without a migration.
  const doc = emptyWorldDoc("00000000-0000-0000-0000-000000000000", "user_123");
  doc.parts = [
    [0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, MAX_TEXTURE],
  ];
  const parsed = parseWorldDoc(doc);
  assert.equal(textureOf(parsed.parts[0]), 0);
  assert.equal(textureOf(parsed.parts[1]), MAX_TEXTURE);
});

test("a surface index past the texture list is rejected", () => {
  // A peer on a newer build could reference a surface this build does not
  // have; the schema is what stops it landing in the document.
  const doc = emptyWorldDoc("00000000-0000-0000-0000-000000000000", "user_123");
  doc.parts = [[0, 0, 0, 0, 0, 0, 0, MAX_TEXTURE + 1]];
  assert.throws(() => parseWorldDoc(doc));
});

test("TEXTURES starts with plain, and plain is index 0", () => {
  // `textureOf` treats a missing field as 0, so 0 has to be the identity.
  assert.equal(TEXTURES[0].name, "plain");
  assert.equal(TEXTURES[0].source, null);
});
