/**
 * Live render statistics, for measuring rather than guessing.
 *
 * MAP.md §10.2 and the performance audit both say the same thing: profile
 * before optimising, because scripting-bound and GPU-bound problems have
 * opposite fixes. The triangle counts that drove the recent work were computed
 * offline from the world data — real, but not the same as numbers off the
 * device that is actually dropping frames.
 *
 * OPT-IN, via `?perf=1`. That is deliberate and it is the lesson from the bike
 * telemetry this replaces: that panel was opt-OUT, so it shipped to every
 * player in every race. A diagnostic that is on by default is not a
 * diagnostic, it is a feature nobody asked for.
 *
 * A plain module object for the same reason race-touch.ts is one — it is
 * written every frame from inside the render loop, and nothing should
 * re-render sixty times a second to carry a measurement. The panel that shows
 * it samples on its own slow timer.
 */

export interface PerfStats {
  /** Frames per second, smoothed over a second. */
  fps: number;
  /** Longest frame in the last sampling window, ms. Where jank shows up. */
  worstMs: number;
  /** renderer.info.render — what the GPU was asked for on the last frame. */
  calls: number;
  triangles: number;
  /** renderer.info.memory — climbing means a leak. */
  geometries: number;
  textures: number;
  /** Compiled shader programs. MAP.md §10.1: stop and consolidate past ~40. */
  programs: number;
  /** Resolved quality tier, so a report says which settings produced it. */
  tier: string;
  /** Effective device pixel ratio. */
  dpr: number;
}

export const perfStats: PerfStats = {
  fps: 0,
  worstMs: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  tier: "?",
  dpr: 0,
};

export const perfEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("perf") === "1";

/**
 * The last full frame's render counts, when a post-processing composer owns
 * the frame; null otherwise.
 *
 * `gl.info` resets itself at the start of every `renderer.render()`, and a
 * composer calls that once per pass — so by the time <PerfProbe> reads it,
 * it holds the final full-screen pass: one call, one triangle, and a panel
 * that says a 10,000-block world costs nothing. <PostFX> switches the reset
 * off, snapshots here after its last pass, and resets by hand.
 */
export const composed: { frame: { calls: number; triangles: number } | null } = {
  frame: null,
};

/**
 * Plain functions rather than assignments in the component, because
 * `react-hooks/immutability` rejects writing a member of a value a hook
 * returned — and `gl` comes from `useThree`. CLAUDE.md's camera rule, again.
 */
export function beginComposedFrames(gl: { info: { autoReset: boolean } }) {
  gl.info.autoReset = false;
}
export function endComposedFrames(gl: { info: { autoReset: boolean } }) {
  gl.info.autoReset = true;
  composed.frame = null;
}
export function snapshotComposedFrame(gl: {
  info: { render: { calls: number; triangles: number }; reset(): void };
}) {
  composed.frame = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
  gl.info.reset();
}
