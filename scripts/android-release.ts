/**
 * Take the APK Bubblewrap just built and make it the one `/download` serves.
 *
 *     npm run android:release            # finds the APK in android/
 *     npm run android:release -- path.apk
 *     npm run cap:release                # the Capacitor app's build instead
 *
 * Three things happen here and each one is a step somebody forgets by hand:
 *
 * 1. The file is copied to `public/blockworld.apk`, which is the only path
 *    `lib/apk.ts` looks at.
 * 2. Its SHA-256 is written beside it. A self-hosted download has no store and
 *    no signature chain a user can inspect before they install, so a published
 *    digest is the only way for somebody to check that the file they got is
 *    the file that was built. It is also what makes "was this tampered with in
 *    transit" a question with an answer rather than a shrug.
 * 3. `APK_VERSION` in `src/lib/apk.ts` is checked against the version in
 *    `android/twa-manifest.json` and the run fails if they disagree. That pair
 *    going stale is silent — the page keeps confidently naming the previous
 *    version over a new file — and it is the only failure here that survives a
 *    deploy and reaches a player.
 */
import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
/** `npm run cap:release` publishes the Capacitor app's build instead of the TWA's. */
const CAPACITOR = process.argv.includes("--capacitor");
const GIVEN = process.argv.slice(2).find((a) => !a.startsWith("--"));
const DEST = path.join(ROOT, "public", "blockworld.apk");
const DIGEST = `${DEST}.sha256`;

/** Where Bubblewrap leaves a signed build, in the order worth trying. */
const CANDIDATES = CAPACITOR
  ? ["capacitor-android/app/build/outputs/apk/release/app-release.apk"]
  : [
      "android/app-release-signed.apk",
      "android/app/build/outputs/apk/release/app-release.apk",
    ];

async function findApk(): Promise<string> {
  if (GIVEN) return path.resolve(ROOT, GIVEN);

  for (const rel of CANDIDATES) {
    const p = path.join(ROOT, rel);
    try {
      if ((await stat(p)).isFile()) return p;
    } catch {
      // Next candidate.
    }
  }

  if (CAPACITOR) {
    throw new Error("No Capacitor APK found. Run `npm run cap:build` first.");
  }

  // Last resort: anything signed sitting at the top of android/. Bubblewrap's
  // output filename has changed between versions, and a build that succeeded
  // should not be unusable because this list is one release out of date.
  try {
    const loose = (await readdir(path.join(ROOT, "android")))
      .filter((f) => f.endsWith(".apk"))
      .sort();
    if (loose.length === 1) return path.join(ROOT, "android", loose[0]);
    if (loose.length > 1) {
      throw new Error(
        `Several APKs in android/ (${loose.join(", ")}). Name the one you mean:\n` +
          `  npm run android:release -- android/<file>.apk`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Several")) throw err;
  }

  throw new Error(
    "No APK found. Run `npm run android:build` first, or pass the path:\n" +
      "  npm run android:release -- path/to/app-release-signed.apk"
  );
}

/**
 * The two places a version number is written, which must not drift.
 *
 * `twa-manifest.json` is what the build stamps into the package; `APK_VERSION`
 * is what the page prints. Nothing connects them automatically because the
 * page has to work before the first APK exists.
 */
async function builtVersion(): Promise<[string, string | undefined]> {
  if (CAPACITOR) {
    const gradle = await readFile(
      path.join(ROOT, "capacitor-android", "app", "build.gradle"),
      "utf8"
    );
    return ["capacitor-android/app/build.gradle", /versionName\s+"([^"]+)"/.exec(gradle)?.[1]];
  }
  const twa = JSON.parse(
    await readFile(path.join(ROOT, "android", "twa-manifest.json"), "utf8")
  ) as { appVersionName?: string };
  return ["android/twa-manifest.json", twa.appVersionName];
}

async function checkVersions(): Promise<string> {
  const [source, built] = await builtVersion();

  const lib = await readFile(path.join(ROOT, "src", "lib", "apk.ts"), "utf8");
  const declared = /APK_VERSION\s*=\s*"([^"]+)"/.exec(lib)?.[1];

  if (!built) throw new Error(`${source} has no version name.`);
  if (!declared) throw new Error("Could not read APK_VERSION from src/lib/apk.ts.");

  if (built !== declared) {
    throw new Error(
      `Version mismatch. ${source} says ${built}, src/lib/apk.ts says ${declared}.\n` +
        `Set APK_VERSION to "${built}" and run this again.`
    );
  }

  if (CAPACITOR) await checkBuildCode();

  return declared;
}

/**
 * The in-app update notice compares an install's versionCode against
 * `LATEST_APP_BUILD`. Publishing a build that constant does not describe
 * either nags every up-to-date install forever or never tells a stale one.
 */
async function checkBuildCode(): Promise<void> {
  const gradle = await readFile(
    path.join(ROOT, "capacitor-android", "app", "build.gradle"),
    "utf8"
  );
  const built = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
  const identity = await readFile(path.join(ROOT, "src", "lib", "capacitor-identity.ts"), "utf8");
  const latest = Number(/LATEST_APP_BUILD\s*=\s*(\d+)/.exec(identity)?.[1]);
  if (!built || built !== latest) {
    throw new Error(
      `versionCode mismatch. build.gradle says ${built}, ` +
        `LATEST_APP_BUILD in src/lib/capacitor-identity.ts says ${latest}.`
    );
  }
}

async function main() {
  const version = await checkVersions();
  const src = await findApk();

  const bytes = await readFile(src);
  const sha = createHash("sha256").update(bytes).digest("hex");

  await copyFile(src, DEST);
  // The `  ` separator and bare filename are `sha256sum`'s own format, so the
  // published line can be pasted straight into `sha256sum -c` rather than
  // eyeballed against a terminal.
  await writeFile(DIGEST, `${sha}  blockworld.apk\n`, "utf8");

  // The build day, from the built file's mtime — the only place it is true.
  // A deployed copy's mtime is whatever the host stamps (see APK_BUILT).
  const day = (await stat(src)).mtime.toISOString().slice(0, 10);
  const libPath = path.join(ROOT, "src", "lib", "apk.ts");
  const lib = await readFile(libPath, "utf8");
  const BUILT_RE = /APK_BUILT\s*=\s*"[^"]*"/;
  if (!BUILT_RE.test(lib)) throw new Error("Could not find APK_BUILT in src/lib/apk.ts.");
  await writeFile(libPath, lib.replace(BUILT_RE, `APK_BUILT = "${day}"`), "utf8");

  const mb = (bytes.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`from    ${path.relative(ROOT, src)}`);
  console.log(`version ${version}`);
  console.log(`size    ${mb} MB`);
  console.log(`sha256  ${sha}`);
  console.log(`built   ${day} (written to APK_BUILT)`);
  console.log(`\nWrote public/blockworld.apk, its .sha256, and APK_BUILT in src/lib/apk.ts.`);
  console.log(`Commit all three and deploy.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
