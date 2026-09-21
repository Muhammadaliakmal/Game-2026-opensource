/**
 * Take the APK Bubblewrap just built and make it the one `/download` serves.
 *
 *     npm run android:release            # finds the APK in android/
 *     npm run android:release -- path.apk
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
const DEST = path.join(ROOT, "public", "blockworld.apk");
const DIGEST = `${DEST}.sha256`;

/** Where Bubblewrap leaves a signed build, in the order worth trying. */
const CANDIDATES = [
  "android/app-release-signed.apk",
  "android/app/build/outputs/apk/release/app-release.apk",
];

async function findApk(): Promise<string> {
  const given = process.argv[2];
  if (given) return path.resolve(ROOT, given);

  for (const rel of CANDIDATES) {
    const p = path.join(ROOT, rel);
    try {
      if ((await stat(p)).isFile()) return p;
    } catch {
      // Next candidate.
    }
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
async function checkVersions(): Promise<string> {
  const twa = JSON.parse(
    await readFile(path.join(ROOT, "android", "twa-manifest.json"), "utf8")
  ) as { appVersionName?: string };

  const lib = await readFile(path.join(ROOT, "src", "lib", "apk.ts"), "utf8");
  const declared = /APK_VERSION\s*=\s*"([^"]+)"/.exec(lib)?.[1];

  if (!twa.appVersionName) throw new Error("twa-manifest.json has no appVersionName.");
  if (!declared) throw new Error("Could not read APK_VERSION from src/lib/apk.ts.");

  if (twa.appVersionName !== declared) {
    throw new Error(
      `Version mismatch. android/twa-manifest.json says ${twa.appVersionName}, ` +
        `src/lib/apk.ts says ${declared}.\n` +
        `Set APK_VERSION to "${twa.appVersionName}" and run this again.`
    );
  }

  return declared;
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

  const mb = (bytes.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`from    ${path.relative(ROOT, src)}`);
  console.log(`version ${version}`);
  console.log(`size    ${mb} MB`);
  console.log(`sha256  ${sha}`);
  console.log(`\nWrote public/blockworld.apk and public/blockworld.apk.sha256.`);
  console.log(`Commit both and deploy; /download reads the file itself.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
