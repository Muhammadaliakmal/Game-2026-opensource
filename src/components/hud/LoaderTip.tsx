"use client";

import { useEffect, useState } from "react";

/**
 * One line of advice under a loading screen, changing every few seconds.
 *
 * The UI spec's boot screen asks for it, and the reason is retention: a
 * bar with nothing to read is a wait, a bar with a hint is a game already
 * talking to you. The set is picked by what is loading — a race tip on a
 * race, a jump tip on a world — and the first one shown is chosen by the
 * clock so a player who loads three worlds in a row does not read the same
 * opening line three times.
 *
 * Fades between lines rather than cutting: a line that snaps to a new one
 * looks like a glitch on a screen that is otherwise still.
 */
export type TipKind = "world" | "race" | "arena" | "any";

const TIPS: Record<Exclude<TipKind, "any">, string[]> = {
  world: [
    "Hold Space to glide a little further on a long jump.",
    "A checkpoint keeps the clock running through a fall — you resume, you do not restart.",
    "Your best run leaves a ghost. Beat it and the ghost is yours again.",
    "Press R to respawn at the last checkpoint if a jump goes wrong.",
    "Settings → Display → Graphics: drop the render scale first if it stutters.",
    "Press V to swap the camera view.",
  ],
  race: [
    "Drift through a corner to fill the boost, then spend it down the straight.",
    "The kerbs are painted, not solid — you can run over them.",
    "Send the code to a friend and they land on your grid.",
    "Vapor Ridge's crest on the back straight will throw you if you carry too much speed.",
    "Settings → Display → Graphics: drop the render scale first if it stutters.",
  ],
  arena: [
    "Five knockdowns win. A fall counts against whoever fell.",
    "Any world can be an arena — open a match from a course and fight on it.",
    "Send the link; whoever opens it is your opponent.",
  ],
};

const PERIOD_MS = 3400;

export function LoaderTip({ kind = "any" }: { kind?: TipKind }) {
  const pool = kind === "any" ? [...TIPS.world, ...TIPS.race, ...TIPS.arena] : TIPS[kind];
  // Start position from the clock, not from zero: see the header.
  const [index, setIndex] = useState(() => Math.floor(Date.now() / PERIOD_MS) % pool.length);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // The swap is two timers: fade out, then change the line and fade in. The
    // inner one has to be cleared too — a loading screen unmounts the instant
    // loading ends, which is as likely as not to be inside that 220ms.
    let swap = 0;
    const id = window.setInterval(() => {
      setVisible(false);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % pool.length);
        setVisible(true);
      }, 220);
    }, PERIOD_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(swap);
    };
  }, [pool.length]);

  return (
    <p
      className="text-dim max-w-sm text-center text-xs transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
      aria-live="off"
    >
      <span className="hud-label text-accent mr-1.5">Tip</span>
      {pool[index]}
    </p>
  );
}
