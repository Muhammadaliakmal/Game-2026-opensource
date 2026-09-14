"use client";

import { useEffect } from "react";
import {
  primeAudio,
  sfxUiConfirm,
  sfxUiHover,
  sfxUiPress,
  sfxUiReject,
} from "@/lib/audio";

/**
 * Every button and link on the site sounds like part of a game. One
 * component, mounted once in the root layout, renders nothing.
 *
 * ── Why delegation and not a `<GameButton>` ──────────────────────────────
 *
 * The spec's route is a button component that plays its own cues. This site
 * has hundreds of `hud-chip`s, cards and links across forty files, and a new
 * component would sound only where somebody remembered to use it — which is
 * how a game gets one silent screen for every two that click. Listening at
 * the window and asking `closest()` gives every control the same cues from
 * one place, including the ones written next month.
 *
 * ── What plays when ──────────────────────────────────────────────────────
 *
 *  - hover:   entering a chip, a card or a mode cover, mouse only. A finger
 *             never hovers, and a phone playing a tick as a thumb slides
 *             across the palette is a phone buzzing.
 *  - press:   pointer down on any button or link, before anything happens —
 *             the thunk is the physicality, and it must not wait for the
 *             click that follows it.
 *  - confirm: the click, if the control is live.
 *  - reject:  the click, if it is disabled. A silently dead control reads as
 *             a bug; a control that says no reads as a rule.
 *
 * The world's own actions — placing a block, a footstep, a jump — have their
 * own sounds and are not buttons, so none of this reaches them. Priming the
 * graph on the first press is also what lets the first real sound of a
 * session play: browsers start the context suspended until a gesture.
 */
const CONTROL = "button, a[href], [role='button']";
const HOVERS = ".hud-chip, .card, [data-mode], .swatch, .hud-menu-item";

export function UiSounds() {
  useEffect(() => {
    const control = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest(CONTROL) as HTMLElement | null) : null;

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = e.target instanceof Element ? e.target.closest(HOVERS) : null;
      if (!el) return;
      // `pointerover` fires again for every child entered; only the first
      // entry into the control should tick.
      if (e.relatedTarget instanceof Element && el.contains(e.relatedTarget)) return;
      sfxUiHover();
    };
    const onDown = (e: PointerEvent) => {
      primeAudio();
      const el = control(e.target);
      if (!el || isInert(el)) return;
      sfxUiPress();
    };
    const onClick = (e: MouseEvent) => {
      const el = control(e.target);
      if (!el) return;
      if (isInert(el)) sfxUiReject();
      else sfxUiConfirm();
    };

    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    // Capture, so a handler that stops propagation — the settings dialog's
    // keyboard gate, a menu that swallows clicks — still sounds.
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}

function isInert(el: HTMLElement) {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true"
  );
}
