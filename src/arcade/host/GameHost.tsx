"use client";

import { useEffect, useRef } from "react";
import { createLoop } from "./loop";
import { resizeCanvas } from "./canvas";
import { attachInput, type InputHost } from "./input";
import { mulberry32 } from "./rng";
import { sfx } from "./audio";
import { startMusic, stopMusic } from "./music";
import type { ArcadeGame, GameServices } from "./types";
import { useArcade } from "../store";
import { entryFor } from "../registry";
import { today } from "../persistence";

/**
 * Turn a finished run into coins.
 *
 * The client sends what it did; the server decides what that is worth. None
 * of the arithmetic is here — not the rate, not the caps — because a payout
 * computed on this side would be a payout the player could edit. See
 * `api/arcade/payout` and `lib/arcade-payout.ts`.
 *
 * Every failure path is the same and is deliberately quiet: a signed-out
 * player has no wallet to pay into, and a network that dropped the request
 * should cost somebody a few coins rather than an error on the screen they
 * are reading their score off. `earned` stays null and the panel simply does
 * not mention coins.
 */
async function settle(gameId: string, score: number) {
  try {
    const res = await fetch("/api/arcade/payout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, score, date: today() }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (typeof data?.earned !== "number") return;

    useArcade.getState().credit(data.earned);
    useArcade.getState().setCapped(Boolean(data.cappedForToday));

    // The wallet moved, so anything showing it is stale. Written straight in
    // rather than refetched — the server just said what it is. Imported here
    // rather than at the top so the arcade does not pull the shop store into
    // its own chunk for a field it touches once per run.
    if (typeof data.coins === "number") {
      const { useShop } = await import("@/lib/shop");
      useShop.setState({ coins: data.coins });
    }
  } catch {
    /* see above: a lost payout is not worth a message */
  }
}

/**
 * The canvas, the loop, and everything a game is handed.
 *
 * ── One effect, keyed on the run ─────────────────────────────────────────
 *
 * Creating a game, starting its loop, and tearing both down is one lifecycle,
 * so it is one effect keyed on `gameId` and `runId`. Splitting it across
 * several — one for the canvas, one for the loop, one for input — is how a
 * restart ends up with two loops driving one game, which reads as the game
 * running at double speed with every input counted twice. `loop.test.ts` pins
 * the half of that the loop can defend on its own.
 *
 * ── The async gap is the dangerous part ──────────────────────────────────
 *
 * A game module is imported lazily and may await a preload, so the component
 * can unmount — or the player can restart — while `create()` is still in
 * flight. Every await is followed by a cancellation check, and a game that
 * finishes creating after that point is destroyed immediately rather than
 * being left running with nothing pointing at it.
 *
 * ── Why score goes through a throttle ────────────────────────────────────
 *
 * `onScore` is called from inside `step`, sixty times a second. Pushing that
 * into a zustand store means a React render sixty times a second, competing
 * with the game for the same 16.6 ms. The host holds the number and pushes it
 * at about 10 Hz, which is faster than anybody can read a score anyway.
 */

/** How often the score reaches React, in milliseconds. */
const SCORE_PUSH_MS = 100;

export function GameHost({ className }: { className?: string }) {
  const gameId = useArcade((s) => s.activeGame);
  const runId = useArcade((s) => s.runId);
  const seed = useArcade((s) => s.seed);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const entry = gameId ? entryFor(gameId) : undefined;
    if (!canvas || !entry) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      useArcade.getState().fail("This browser could not open a 2D canvas.");
      return;
    }

    let cancelled = false;
    let game: ArcadeGame | null = null;
    let input: InputHost | null = null;
    let over = false;
    let score = 0;
    let pushedAt = 0;
    let pushed = -1;

    resizeCanvas(canvas, ctx);

    const services: GameServices = {
      ctx,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      // Recreated per run from the store's seed, so a run is reproducible.
      rng: mulberry32(seed),
      // Replaced once input is attached; a game cannot step before then.
      input: { keys: {}, pointer: { x: 0, y: 0, down: false }, axis: { x: 0, y: 0 }, touches: [] },
      sfx,
      onScore: (n) => {
        score = n;
      },
      onGameOver: (final) => {
        if (over) return; // A game that ends twice must only be paid once.
        over = true;
        score = final;
        stopRun();
        // The screen goes up on the score, which is known now. The payout is
        // a request, and a death screen that waited for the network to draw
        // would make every death feel like a stutter.
        useArcade.getState().finish(entry.id, final);
        void settle(entry.id, final);
      },
      onPlaced: (place, of) => {
        if (over) return;
        over = true;
        stopRun();
        useArcade.getState().finishPlaced(entry.id, place, of);
        // No `settle`. A board cabinet pays nothing yet, and that is the right
        // way round: the rate is a flat amount per placement rather than a
        // rate per point (`plan-phase8.md` §2B), nobody has agreed the numbers,
        // and paying a placement through the runner's route would pay 1 coin
        // for first place and 4 for last.
      },
    };

    const loop = createLoop(
      (dt) => {
        if (!game) return;
        game.step(dt, services);
        // After the step, so an edge is true for exactly one step whatever the
        // frame rate — see `input.ts`.
        input?.endStep();
      },
      (alpha) => {
        if (!game) return;
        game.render(alpha, services);
        const now = performance.now();
        if (now - pushedAt >= SCORE_PUSH_MS && score !== pushed) {
          pushedAt = now;
          pushed = score;
          useArcade.getState().setScore(score);
        }
      }
    );

    /**
     * The track plays exactly when the loop runs, and that is the whole rule.
     * Paused, tabbed away, dead, or torn down all stop it, because all four
     * already stop the loop. Keying it off the game's status instead would be
     * four places to remember, and the one that gets forgotten is always the
     * tab switch — which leaves music playing in a tab nobody is looking at.
     *
     * `startMusic` ignores a second call, so pairing it with every `start` is
     * free on a resume.
     */
    const startRun = () => {
      loop.start();
      startMusic(seed, entry.bpm);
    };
    const stopRun = () => {
      loop.stop();
      stopMusic();
    };

    // ── Size ──────────────────────────────────────────────────────────────
    // Only when the pixel dimensions actually moved: setting them clears the
    // canvas, so an observer that fired on every layout would strobe.
    const observer = new ResizeObserver(() => {
      if (!resizeCanvas(canvas, ctx)) return;
      services.width = canvas.clientWidth;
      services.height = canvas.clientHeight;
      game?.resize?.(services.width, services.height);
    });
    observer.observe(canvas);

    // ── Tab visibility ────────────────────────────────────────────────────
    // A hidden tab throttles rAF to about once a second, so the accumulator
    // would hand back a pile of catch-up steps on return. The loop clamps that
    // anyway; stopping outright means it never has to.
    const onVisibility = () => {
      if (document.hidden) {
        stopRun();
        input?.clear();
      } else if (!over && useArcade.getState().status === "playing") {
        startRun();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── Pause ─────────────────────────────────────────────────────────────
    // Subscribed rather than a dependency: pausing must not tear the game
    // down and rebuild it, which is what putting `status` in the effect's deps
    // would do.
    const unsubscribe = useArcade.subscribe((s, prev) => {
      if (s.status === prev.status) return;
      if (s.status === "playing" && !over && !document.hidden) startRun();
      else stopRun();
      if (s.status !== "playing") input?.clear();
    });

    void (async () => {
      try {
        const mod = (await entry.load()).default;
        if (cancelled) return;
        await mod.preload?.();
        if (cancelled) return;

        input = attachInput(canvas);
        (services as { input: GameServices["input"] }).input = input.state;
        services.width = canvas.clientWidth;
        services.height = canvas.clientHeight;

        const created = await mod.create(services);
        if (cancelled) {
          // Finished creating after the run was abandoned. Destroying it here
          // is the only place that can: nothing else holds a reference.
          created.destroy();
          return;
        }
        game = created;
        useArcade.getState().setStatus("playing");
        startRun();
      } catch {
        if (!cancelled) {
          useArcade
            .getState()
            .fail(
              navigator.onLine === false
                ? "You are offline, and this cabinet has not been downloaded yet. Open the arcade once while online and every cabinet works offline after that."
                : "That cabinet would not start."
            );
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      stopRun();
      input?.detach();
      game?.destroy();
      game = null;
    };
  }, [gameId, runId, seed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      // The canvas takes the pointer; the overlay's own chrome sits above it.
      style={{ touchAction: "none", display: "block", width: "100%", height: "100%" }}
    />
  );
}
