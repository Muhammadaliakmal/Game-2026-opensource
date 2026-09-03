import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * What the /download page knows about the Android build.
 *
 * The APK is not built by this repo. It is generated from the deployed site by
 * PWABuilder — which reads app/manifest.ts and wraps the live URL in a Trusted
 * Web Activity — and the resulting file is dropped at `public/blockworld.apk`.
 * See docs/ANDROID.md.
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
export const APK_VERSION = "1.0.0";

export interface ApkInfo {
  available: boolean;
  /** Bytes, or 0 when absent. */
  size: number;
  /** ISO date the file was last written, or null when absent. */
  built: string | null;
  version: string;
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
    const s = await stat(path.join(process.cwd(), "public", APK_FILE));
    return {
      available: s.isFile() && s.size > 0,
      size: s.size,
      built: s.mtime.toISOString(),
      version: APK_VERSION,
    };
  } catch {
    // ENOENT is the normal state before the first build is dropped in, so this
    // is an expected branch rather than an error worth logging.
    return { available: false, size: 0, built: null, version: APK_VERSION };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}
