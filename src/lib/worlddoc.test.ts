import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorldDoc, emptyWorldDoc } from "./worlddoc";

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
