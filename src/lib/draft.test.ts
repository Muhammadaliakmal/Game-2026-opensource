import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseWorldDoc } from "./worlddoc";
// Safe to import before the stub exists: the module only touches `window`
// inside its functions, never at module scope.
import * as draft from "./draft";

/**
 * The draft is the ONLY copy of a world built without an account, so its
 * failure modes are the ones that lose someone's work outright.
 *
 * localStorage does not exist in node, and it can also throw in a real browser
 * (private mode, quota, blocked site data). The stub below covers both: the
 * normal case, and a store that throws on every access.
 */

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function installStorage(store: Store) {
  (globalThis as unknown as { window: { localStorage: Store } }).window = {
    localStorage: store,
  };
}

function workingStorage(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function hostileStorage(): Store {
  const boom = () => {
    throw new DOMException("denied");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

beforeEach(() => installStorage(workingStorage()));

test("a new draft is a valid WorldDoc with something already in it", () => {
  const doc = draft.newDraftDoc();
  assert.doesNotThrow(() => parseWorldDoc(doc));
  // Never an empty grid: blank-canvas paralysis is the documented drop-off.
  assert.ok(doc.parts.length > 100);
  assert.equal(doc.id, draft.DRAFT_ID);
});

test("a draft round trips", () => {
  const doc = draft.newDraftDoc();
  draft.saveDraft(doc);
  assert.equal(draft.hasDraft(), true);

  const back = draft.loadDraft();
  assert.ok(back);
  assert.equal(back.parts.length, doc.parts.length);
  assert.deepEqual(back.spawn, doc.spawn);
});

test("clearing removes it", () => {
  draft.saveDraft(draft.newDraftDoc());
  draft.clearDraft();
  assert.equal(draft.hasDraft(), false);
  assert.equal(draft.loadDraft(), null);
});

test("a corrupt or outdated draft reads as no draft, never as a crash", () => {
  // This string survives deploys, so it can predate the current schema or be
  // hand-edited. Throwing here would mean an editor that refuses to open.
  const store = workingStorage();
  installStorage(store);

  for (const junk of [
    "not json at all",
    "{}",
    '{"v":99}',
    JSON.stringify({ ...draft.newDraftDoc(), parts: [[1, 2]] }),
    JSON.stringify({ ...draft.newDraftDoc(), spawn: "nope" }),
  ]) {
    store.map.set("blockworld:draft", junk);
    assert.equal(draft.loadDraft(), null, `should reject ${junk.slice(0, 24)}`);
  }
});

test("storage that throws degrades to no draft instead of breaking the editor", () => {
  installStorage(hostileStorage());
  assert.equal(draft.hasDraft(), false);
  assert.equal(draft.loadDraft(), null);
  assert.doesNotThrow(() => draft.saveDraft(draft.newDraftDoc()));
  assert.doesNotThrow(() => draft.clearDraft());
});
