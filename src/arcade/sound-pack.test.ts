import { test } from "node:test";
import assert from "node:assert/strict";
import { FIGHT_PACKS, FIGHT_PACK_LABEL, getFightPack, setFightPack, subscribeFightPack } from "./sound-pack";
import { burnSound, clashSound, hitSound, koSound, whooshSound, windupSound } from "./games/duel/sound";

test("the default pack is the kit the rules were written for", () => {
  assert.equal(getFightPack(), "metal");
});

test("every pack has a label and answers every event without throwing", () => {
  // No AudioContext under node, so each call returns early — what this
  // proves is that no pack is missing a branch that reaches past the guard.
  for (const p of FIGHT_PACKS) {
    assert.ok(FIGHT_PACK_LABEL[p]);
    setFightPack(p);
    assert.equal(getFightPack(), p);
    hitSound(20, true, true, 480, "maul");
    hitSound(4, false, false, 0, "rebar");
    clashSound(900, 960);
    whooshSound(1);
    windupSound();
    koSound(480);
    burnSound(100);
  }
});

test("a change is announced, so the pause screen redraws", () => {
  let n = 0;
  const off = subscribeFightPack(() => n++);
  setFightPack("retro");
  off();
  setFightPack("metal");
  assert.equal(n, 1);
});
