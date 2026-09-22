"use client";

import { useSyncExternalStore } from "react";
import { isAndroidApp } from "./app-mode";

/**
 * Chrome's install prompt, made available to a button.
 *
 * The browser fires `beforeinstallprompt` when it decides the app is
 * installable, and the event is the *only* handle on the install dialog —
 * there is no API to open it on demand. So the event has to be caught and kept
 * the moment it fires, which is usually before any component that wants it has
 * mounted.
 *
 * Hence the module-level latch: the listener is attached at import time, and a
 * hook mounting later still finds the event waiting for it. A hook that only
 * listened from its own effect would miss the event on most page loads and the
 * install button would simply never appear, intermittently, which is the worst
 * possible way for this to fail.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Without this Chrome shows its own mini-infobar and the event is consumed,
    // so the page's own button would have nothing left to trigger.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    announce();
  });

  window.addEventListener("appinstalled", () => {
    // A prompt cannot be reused, and there is nothing left to install.
    deferred = null;
    announce();
  });
}

/**
 * Both values below are read through `useSyncExternalStore` rather than pulled
 * into state by an effect.
 *
 * That is not style. `useEffect(() => setState(read()))` renders twice on every
 * mount and can tear during hydration — React may commit the first render
 * before the effect has run, so the DOM briefly shows the server's answer. The
 * `getServerSnapshot` argument is the supported way to say what the server
 * should have rendered, which is the same problem the effect was working
 * around. React's `set-state-in-effect` lint rule flags the difference.
 */
function subscribePrompt(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const promptSnapshot = () => deferred !== null;
/** The server has no prompt to offer, so the button starts hidden. */
const promptServerSnapshot = () => false;

/**
 * `display-mode` is a live media query — an installed app can be launched
 * either way — so this subscribes rather than sampling once.
 */
const STANDALONE_QUERIES = ["(display-mode: fullscreen)", "(display-mode: standalone)"];

function subscribeStandalone(cb: () => void) {
  const lists = STANDALONE_QUERIES.map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener("change", cb);
  return () => {
    for (const l of lists) l.removeEventListener("change", cb);
  };
}

function standaloneSnapshot(): boolean {
  return (
    STANDALONE_QUERIES.some((q) => window.matchMedia(q).matches) ||
    // Safari supports neither the media query nor the install event, and this
    // non-standard flag is the only way to detect an installed app there.
    (navigator as { standalone?: boolean }).standalone === true ||
    // An Android WebView always reports `display-mode: browser`, so inside the
    // Capacitor app neither check above can fire and /download would offer to
    // install the APK the player is already running.
    isAndroidApp()
  );
}

const standaloneServerSnapshot = () => false;

export interface InstallPrompt {
  /** True when the browser has offered a prompt we are holding. */
  available: boolean;
  /** Opens it. Resolves to whether the install actually happened. */
  install: () => Promise<boolean>;
  /** True when already running as an installed app rather than in a tab. */
  installed: boolean;
}

export function useInstallPrompt(): InstallPrompt {
  const available = useSyncExternalStore(
    subscribePrompt,
    promptSnapshot,
    promptServerSnapshot
  );
  const installed = useSyncExternalStore(
    subscribeStandalone,
    standaloneSnapshot,
    standaloneServerSnapshot
  );

  const install = async () => {
    if (!deferred) return false;
    const e = deferred;
    // Cleared first: the event is single-use, and leaving it in place would let
    // a second click call `prompt()` on a spent event, which throws.
    deferred = null;
    announce();
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === "accepted";
  };

  return { available, install, installed };
}
