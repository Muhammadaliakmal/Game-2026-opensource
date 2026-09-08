"use client";

import { useEditorStore } from "@/stores/editor-store";
import { MAX_CHECKPOINTS } from "@/lib/worlddoc";

/**
 * The finish and the resume points, as a list.
 *
 * The palette's counterpart for the two course tools, in the same slot the
 * prop browser takes: colour and shape mean nothing while placing a marker,
 * and the thing that does mean something — what order the gates are in — is
 * invisible in the world until you run it.
 *
 * ── Why this panel exists at all ─────────────────────────────────────────
 *
 * Order is the whole mechanic. `checkpoints.ts` reads "later in the course"
 * straight off the array, forward only, so a gate placed out of sequence is
 * not a cosmetic mistake — it is a course that can be finished without ever
 * passing through it, or one whose resume point sends a runner backwards.
 * Numbered markers in the world say what the order is; this says it in one
 * place you can read without orbiting, and is the only way to delete one.
 *
 * Deleting renumbers everything after it, which is the honest consequence of
 * order being position rather than identity, and is why the list is here
 * rather than only on the markers.
 */
export function CoursePanel() {
  const goal = useEditorStore((s) => s.goal);
  const checkpoints = useEditorStore((s) => s.checkpoints);
  const tool = useEditorStore((s) => s.tool);
  const readOnly = useEditorStore((s) => s.readOnly);

  const full = checkpoints.length >= MAX_CHECKPOINTS;

  return (
    <div className="hud-panel pointer-events-auto flex max-w-[min(92vw,32rem)] flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="hud-label">
          {tool === "goal" ? "Finish" : "Checkpoints"}
        </span>
        <span className="text-2xs text-dim">
          {tool === "goal"
            ? goal
              ? `${goal.map((n) => Math.round(n)).join(", ")}`
              : "not placed"
            : `${checkpoints.length} / ${MAX_CHECKPOINTS}`}
        </span>
      </div>

      {tool === "goal" ? (
        <>
          <p className="text-2xs text-dim max-w-[26rem]">
            {goal
              ? "Click another block to move it."
              : "Click a block to put the finish on top of it. A world with a finish is a course: it gets a clock, a personal best and a leaderboard."}
          </p>
          {goal && !readOnly && (
            <button
              onClick={() => useEditorStore.getState().clearGoal()}
              className="hud-chip self-start"
              title="Remove the finish (Ctrl+Z puts it back)"
            >
              Remove finish
            </button>
          )}
        </>
      ) : (
        <>
          {checkpoints.length === 0 ? (
            <p className="text-2xs text-dim max-w-[26rem]">
              Click blocks along the route, in the order a runner meets them. A
              fall returns them to the last one they passed, with the clock
              still running.
            </p>
          ) : (
            <div className="hud-scroll flex flex-nowrap gap-1 overflow-x-auto">
              {checkpoints.map((cp, i) => (
                <button
                  key={`${cp.pos.join()}:${i}`}
                  onClick={() => useEditorStore.getState().removeCheckpoint(i)}
                  disabled={readOnly}
                  className="hud-chip shrink-0"
                  title={`Checkpoint ${i + 1} at ${cp.pos
                    .map((n) => Math.round(n))
                    .join(", ")} — click to remove`}
                >
                  {i + 1} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
          {full && (
            <p className="text-2xs text-dim">
              That is the limit. A course needing more than {MAX_CHECKPOINTS} has
              stopped being a course.
            </p>
          )}
        </>
      )}
    </div>
  );
}
