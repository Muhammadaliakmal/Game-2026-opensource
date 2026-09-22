import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * What the /download page knows about the Android build.
 *
 * The file at `public/blockworld.apk` is whichever Android build was last
 * published there: the Capacitor app by `npm run cap:release` (what ships
 * now — see docs/CAPACITOR.md), or the Bubblewrap TWA by
 * `npm run android:release` (docs/ANDROID.md). Both open the live site
 * fullscreen, so the page's copy holds for either.
 *
 * It is still not built by `npm run build`. Bubblewrap needs the JDK and the
 * Android SDK, and it reads the *deployed* manifest over HTTPS rather than the
 * one on disk, so there is nothing about it a web build could do.
 *
 * That means the page cannot assume the file is there, and hard-coding a size
 * and version would go stale the first time the APK is replaced. So both are
 * read off the file itself at request time.
 */

export const APK_FILE = "blockworld.apk";
export const APK_PATH = `/${APK_FILE}`;

/**
 * Bump when a new APK is dropped in. Only a label — the file is the truth —
 * but "which build am I on" is the first question anybody sideloading asks,
 * and a mtime does not answer it.
 */
export const APK_VERSION = "1.0.3";

export interface ApkInfo {
  available: boolean;
  /** Bytes, or 0 when absent. */
  size: number;
  /** ISO date the file was last written, or null when absent. */
  built: string | null;
  version: string;
  /**
   * Lowercase hex SHA-256 of the file, or null when it has not been recorded.
   *
   * Written beside the APK by `npm run android:release`. Published because a
   * sideloaded download is the one distribution channel with nothing else in
   * it: no store, no reviewer, and no publisher identity a phone can check
   * before the install. The digest is what makes "is this the file that was
   * built" answerable by the person installing it rather than a matter of
   * trusting the link.
   */
  sha256: string | null;
}

/**
 * Stats the APK on disk.
 *
 * `fs` rather than a fetch to our own URL: this runs on the server during
 * render, and a server fetching itself to find out whether a static file exists
 * is a request that can deadlock a single-worker dev server.
 */
export async function apkInfo(): Promise<ApkInfo> {
  try {
    const file = path.join(process.cwd(), "public", APK_FILE);
    const s = await stat(file);
    return {
      available: s.isFile() && s.size > 0,
      size: s.size,
      built: s.mtime.toISOString(),
      version: APK_VERSION,
      sha256: await readDigest(`${file}.sha256`),
    };
  } catch {
    // ENOENT is the normal state before the first build is dropped in, so this
    // is an expected branch rather than an error worth logging.
    return {
      available: false,
      size: 0,
      built: null,
      version: APK_VERSION,
      sha256: null,
    };
  }
}

/**
 * The digest, or null.
 *
 * Its own try/catch rather than sharing the one above, because a missing
 * `.sha256` beside an APK that is present is a *recoverable* state — the page
 * should still offer the download and simply not print a checksum. Folded into
 * the outer catch it would report the whole APK as absent, which is the more
 * misleading of the two wrong answers.
 *
 * The file is `sha256sum` format — `<hex>  <filename>` — so only the first
 * field is the digest, and it is validated rather than trusted: a truncated
 * write should show nothing rather than a checksum that will never match.
 */
async function readDigest(file: string): Promise<string | null> {
  try {
    const hex = (await readFile(file, "utf8")).trim().split(/\s+/)[0] ?? "";
    return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}
