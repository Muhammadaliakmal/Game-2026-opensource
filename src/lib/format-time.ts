/**
 * A course time, as a string. Pure, and imports nothing.
 *
 * ── Why this is not in `components/play/course.ts` any more ──────────────
 *
 * Because that file's first line is `import { create } from "zustand"`, and
 * three server components wanted this function: `/parkour`, the guide pages,
 * and `<CommunityCourses>`. Each of them was dragging a client-side store
 * into a statically rendered page to format a number — the same trade
 * `lib/sky-stops.ts` and `lib/cell-key.ts` already exist to avoid, and for
 * the same reason.
 *
 * `course.ts` re-exports it, so nothing that already imported it from there
 * has to change and there is still one implementation.
 *
 * ── The format ───────────────────────────────────────────────────────────
 *
 * `m:ss.cc` — centiseconds, not milliseconds. A run is timed to the
 * millisecond and displayed to the hundredth, because the third digit
 * changes faster than a person can read it and its only effect on a HUD is to
 * make the number look unstable.
 *
 * Negative input clamps to zero rather than rendering `-0:00.00`: a clock
 * that has not started and a clock reading back a bad value should look the
 * same, which is stopped.
 */
export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
