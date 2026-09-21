import { test } from "node:test";
import assert from "node:assert/strict";
import { androidFingerprints, ANDROID_PACKAGE_ID } from "./android";

/**
 * `androidFingerprints` is a parser for a value a human pastes out of two
 * different tools, into an environment variable, months apart — and the file
 * it feeds is read by a verifier that reports nothing when it is unhappy.
 * A wrong answer here does not throw and does not log: the app installs, runs,
 * and wears a browser address bar across the HUD forever.
 *
 * So the cases below are the paste mistakes, not the happy path.
 */

const A = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const B = "01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF";

/** Set the variable for one call and always put it back. */
function withEnv<T>(value: string | undefined, fn: () => T): T {
  const had = Object.hasOwn(process.env, "ANDROID_CERT_FINGERPRINTS");
  const before = process.env.ANDROID_CERT_FINGERPRINTS;
  if (value === undefined) delete process.env.ANDROID_CERT_FINGERPRINTS;
  else process.env.ANDROID_CERT_FINGERPRINTS = value;
  try {
    return fn();
  } finally {
    if (had) process.env.ANDROID_CERT_FINGERPRINTS = before;
    else delete process.env.ANDROID_CERT_FINGERPRINTS;
  }
}

test("unset means no fingerprints, not a crash", () => {
  // The state before the first build exists. The file is still served, still
  // valid JSON, and verifies nothing — which is correct, because there is
  // nothing yet to verify.
  assert.deepEqual(withEnv(undefined, androidFingerprints), []);
  assert.deepEqual(withEnv("", androidFingerprints), []);
});

test("both keys survive, which is the case that is always forgotten", () => {
  // One is the upload key, one is Play's app signing key. A file with only the
  // first passes for sideloaders and fails for every Play install.
  assert.deepEqual(withEnv(`${A},${B}`, androidFingerprints), [A, B]);
});

test("the shapes a paste actually arrives in are all accepted", () => {
  // keytool prints colons and uppercase; the Play Console's copy button and
  // most shell pipelines do not. Both, and a newline-separated paste, are the
  // same value.
  const bare = B.replace(/:/g, "").toLowerCase();
  assert.deepEqual(withEnv(bare, androidFingerprints), [B]);
  assert.deepEqual(withEnv(`${A}\n  ${B}\n`, androidFingerprints), [A, B]);
  assert.deepEqual(withEnv(` ${A} ,, ${B} `, androidFingerprints), [A, B]);
});

test("a malformed entry is dropped rather than served", () => {
  // This is the whole reason the parser exists. The verifier reads the file as
  // a unit: one entry that is not 32 hex bytes invalidates it and takes the
  // good fingerprint beside it down too. Dropping the bad one keeps the app
  // that *can* be verified working.
  assert.deepEqual(withEnv(`${A},notahash,${B}`, androidFingerprints), [A, B]);
  // Truncated by one byte — the shape of a paste that clipped a character.
  assert.deepEqual(withEnv(`${A},${B.slice(0, -3)}`, androidFingerprints), [A]);
  // A SHA-1 fingerprint, which keytool prints directly above the SHA-256 one
  // and is therefore the easiest of all of these to copy by mistake.
  assert.deepEqual(
    withEnv("DA:39:A3:EE:5E:6B:4B:0D:32:55:BF:EF:95:60:18:90:AF:D8:07:09", androidFingerprints),
    []
  );
});

test("the same key listed twice is listed once", () => {
  // Re-pasting the local fingerprint while adding the Play one is the obvious
  // way to end up here, and a duplicate entry is not an error the verifier
  // reports — it is just noise in a file people have to read by eye.
  assert.deepEqual(withEnv(`${A}, ${A.toLowerCase()}`, androidFingerprints), [A]);
});

test("the package id is the one the app-mode referrer check expects", () => {
  // Not a style rule: `lib/app-mode.ts` matches `android-app://<this>` to
  // decide it is running inside the app, and `android/twa-manifest.json`
  // stamps it into the package. A reverse-DNS id with no spaces or uppercase
  // is also what Android will accept at all.
  assert.match(ANDROID_PACKAGE_ID, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
});
