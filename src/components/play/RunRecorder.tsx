"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { GhostRecorder } from "@/lib/ghost";
import { useRuns } from "@/lib/runs";
import { playerFocus, look } from "./camera-rig";
import { useCourse } from "./course";

/**
 * Records the run in progress, and posts it when it ends.
 *
 * ── Why this is a canvas component and not a hook in the HUD ─────────────
 *
 * A ghost is a position sampled on a schedule, and the position lives in
 * `playerFocus`, which the camera rig writes every frame. Reading it needs a
 * frame loop, and the only frame loops are inside the Canvas. Putting the
 * submit here as well keeps "the run finished" and "the run was sent" in one
 * place; splitting them across the tree would mean two components watching the
 * same store field and hoping to agree about which of them acts on it.
 *
 * ── What is recorded ─────────────────────────────────────────────────────
 *
 * Position from the character, facing from the camera — the same pair
 * `sendMove` publishes to peers, and for the same reason: what a watcher reads
 * off a figure is which way it is looking, not which way its hips point.
 *
 * The clock is the course's own `startedAt`, so the ghost and the timer on
 * screen cannot disagree. That also makes a checkpoint respawn free: the run
 * continues, the clock continues, and the recording continues from wherever
 * the runner reappears — which is exactly what the replay should show.
 */
export function RunRecorder({ worldId }: { worldId: string }) {
  const recorder = useRef(new GhostRecorder());
  /**
   * The `startedAt` the current recording belongs to.
   *
   * A restart gives the course a new start timestamp, and that — rather than a
   * separate event — is the signal to throw the recording away. Watching the
   * value means no ordering problem between the store's restart and this
   * component's next frame.
   */
  const recordingFor = useRef<number | null>(null);
  /** The finish already submitted, so a re-render cannot post it twice. */
  const submitted = useRef<number | null>(null);

  // Fetch the board when the course opens, and a ghost to chase with it.
  useEffect(() => {
    const runs = useRuns.getState();
    void runs.load(worldId);
    // A "beat my time" link names the runner to chase (`?vs=<userId>`), and
    // that is the whole point of following one, so it wins over the usual
    // choice. Read off the location rather than the router: this mounts
    // inside the R3F root, which is a separate React tree from the page's.
    // Otherwise your own best first: on the attempt after a personal best,
    // the run worth chasing is the one you just did. `GhostRunner` falls
    // back to the record when there is no personal one yet.
    const vs = new URLSearchParams(window.location.search).get("vs");
    void runs.loadGhost(worldId, vs ? `user:${vs}` : "me");
    return () => useRuns.getState().clear();
  }, [worldId]);

  useFrame(() => {
    const { startedAt, finishedMs } = useCourse.getState();
    if (startedAt === null) return;

    if (recordingFor.current !== startedAt) {
      recordingFor.current = startedAt;
      submitted.current = null;
      recorder.current.reset();
    }

    if (finishedMs === null) {
      recorder.current.sample(
        performance.now() - startedAt,
        playerFocus.x,
        playerFocus.y,
        playerFocus.z,
        look.yaw
      );
      return;
    }

    if (submitted.current === startedAt) return;
    submitted.current = startedAt;
    // One last sample so the replay ends standing on the goal rather than a
    // tenth of a second short of it.
    recorder.current.sample(
      finishedMs,
      playerFocus.x,
      playerFocus.y,
      playerFocus.z,
      look.yaw
    );
    void useRuns
      .getState()
      .submit(worldId, finishedMs, recorder.current.track());
  });

  return null;
}
