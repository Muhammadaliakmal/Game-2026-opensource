"use client";

import { useEffect, useState } from "react";
import { reducedMotion } from "@/lib/motion";

/**
 * The payoff beat at the end of a run.
 *
 * ── Why this is not just a line of text ──────────────────────────────────
 *
 * The arcade's entire pitch is that runs pay a currency which buys characters.
 * The moment a run ends is the single highest-attention beat in that loop —
 * it is the only time the player is looking at the screen with nothing else to
 * do — and it was spending that attention on a score and two buttons. The
 * coins were credited to the server, the wallet in the header updated, and
 * nobody was ever told what the run was worth.
 *
 * A number that counts up is doing something a static number cannot: it takes
 * time, and taking time is what makes a reward read as an event rather than as
 * a field. Six hundred milliseconds is long enough to notice and short enough
 * that nobody waits for it.
 *
 * ── Why the count is rAF and not a CSS animation ─────────────────────────
 *
 * The thing being animated is the *text*, not a style. `@property` counters
 * can be done in CSS now but land as a string with no control over rounding,
 * and a coin total that flickers through "17.4" is worse than one that does
 * not move at all.
 *
 * ── Reduced motion ───────────────────────────────────────────────────────
 *
 * The count is skipped, not shortened: it is information delivered over time,
 * and under reduced motion the honest version is to deliver it immediately.
 * The value is still shown. `lib/motion.ts` is the only reader of the setting
 * outside globals.css, per CLAUDE.md, so it is asked rather than re-derived.
 */
function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    // Every write to state happens inside the rAF callback and none in the
    // effect body — including the reduced-motion shortcut, which jumps to the
    // final value on the first frame rather than setting it synchronously
    // here. `react-hooks/set-state-in-effect` is on and rejects the latter
    // (CLAUDE.md), and it is right to: a setState in an effect body is a
    // second render on every mount. One frame is not perceptible; a cascading
    // render on the highest-attention screen in the app is.
    const skip = reducedMotion() || target <= 0;
    const started = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (skip) {
        setValue(target);
        return;
      }
      const t = Math.min(1, (now - started) / ms);
      // Ease-out: most of the movement happens early, so the number is
      // readable for most of the time it is on screen.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}

export function RewardBurst({
  score,
  best,
  earned,
  balance,
  capped = false,
  label = "Run over",
}: {
  score: number;
  /** The best on this cabinet, for the new-best test. */
  best: number;
  /**
   * Coins this run paid, or null when the payout could not be settled — a
   * signed-out player has no wallet, and a dropped request should cost a few
   * coins rather than put an error on the screen somebody is reading their
   * score off. Null renders no coin line at all rather than "+0".
   */
  earned: number | null;
  /** The wallet after the payout, when it is known. */
  balance?: number | null;
  /** The day's payout ceiling was reached. Scores still count. */
  capped?: boolean;
  label?: string;
}) {
  const newBest = score > 0 && score >= best;
  const coins = useCountUp(earned ?? 0);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* The badge above the number rather than beside it: a new best is the
          headline when there is one, and the score is the evidence. */}
      {newBest ? (
        <span
          className="hud-label"
          style={{
            color: "var(--color-accent)",
            opacity: 1,
            textShadow: "var(--glow)",
          }}
        >
          New best
        </span>
      ) : (
        <span className="hud-label">{label}</span>
      )}

      <p className="hud-readout num text-3xl font-bold">{score}</p>

      {earned !== null && earned > 0 && (
        <p className="num text-accent flex items-baseline gap-1.5 text-base font-semibold">
          <span aria-hidden>+</span>
          {/* `aria-live` off and a plain sr-only sentence instead: announcing
              every frame of a count-up is forty announcements of a number
              that has not finished changing. */}
          <span aria-hidden>⬤ {coins}</span>
          <span className="sr-only">Earned {earned} coins</span>
        </p>
      )}

      {/* The wallet, so the reward lands somewhere the player can see rather
          than only in a header they are not looking at. */}
      {earned !== null && earned > 0 && typeof balance === "number" && (
        <span className="hud-label num">{balance.toLocaleString()} total</span>
      )}

      {/* Said once the day is spent, because a player watching the coin line
          vanish deserves to know it is the cap rather than a bug. */}
      {capped && (
        <span className="hud-label">
          Coin limit reached for today · scores still count
        </span>
      )}
    </div>
  );
}

/**
 * The same beat for a course finish, where the currency is a medal and a time
 * rather than a score.
 *
 * Split as a second export rather than a prop-driven mode: the two share the
 * count-up and nothing else, and a component that renders either a stack of
 * coins or a stack of split times depending on a flag is two components in a
 * trench coat.
 */
export function useRewardCount(target: number, ms?: number): number {
  return useCountUp(target, ms);
}
