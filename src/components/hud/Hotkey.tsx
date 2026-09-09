"use client";

import { useCoarsePointer } from "@/lib/use-media-query";

/**
 * A keyboard shortcut, shown only to something that has a keyboard.
 *
 * ── The bug this exists for ──────────────────────────────────────────────
 *
 * Every "press R to try again" in the app was written on a desktop and shipped
 * to a phone, so a player who has just died on a touchscreen is offered
 * "Again · R" and "Quit · Esc" — two keys they do not have, taking up space in
 * the two labels they do need to read. The arcade cabinet cards had the same
 * shape the other way round ("SPACE / TAP to jump"), which puts the input the
 * reader does *not* have first.
 *
 * ── Why `(pointer: coarse)` and not a user-agent sniff ───────────────────
 *
 * The question is "what is this person about to press", and the primary
 * pointer is the only honest signal for it. A tablet with a keyboard attached
 * reports a fine pointer and gets the shortcut, which is correct. A narrow
 * desktop window still reports fine, so a resized browser does not suddenly
 * start talking about taps — which is exactly why this uses
 * `useCoarsePointer` and not `useTouchControls`: the latter deliberately
 * includes narrow windows, because *layout* should follow the width even when
 * the input does not.
 *
 * ── Why it renders nothing rather than hiding with CSS ───────────────────
 *
 * A `hidden sm:inline` would leave the text in the accessibility tree, so a
 * screen reader on a phone still announces a key that does not exist. It also
 * cannot answer the pointer question at all — that is a device fact, not a
 * width one.
 */
export function Hotkey({ children }: { children: string }) {
  const coarse = useCoarsePointer();
  if (coarse) return null;
  return (
    <>
      <span aria-hidden className="text-dim opacity-60">
        ·
      </span>
      <kbd className="hud-label num" style={{ opacity: 0.8 }}>
        {children}
      </kbd>
    </>
  );
}

/**
 * The same decision for a whole sentence rather than a suffix.
 *
 * Cabinets describe how they are played, and the two descriptions are
 * different sentences rather than one sentence with a key bolted on — "Tap to
 * jump · hold to glide" versus "Space to jump · hold to glide". Picking
 * between two authored strings beats assembling one, because only the author
 * knows whether the verb changes with the input.
 */
export function ControlsHint({
  hint,
  className = "hud-label",
}: {
  hint: { touch: string; keys: string };
  className?: string;
}) {
  const coarse = useCoarsePointer();
  return <span className={className}>{coarse ? hint.touch : hint.keys}</span>;
}
