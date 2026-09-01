"use client";

import { parseWorldDoc, type WorldDoc } from "./worlddoc";
import { parkourWorldDoc } from "./parkour";

/**
 * The local draft: a world someone is building without an account.
 *
 * UI spec §3.1 is blunt that an auth wall in front of the core loop is the
 * most expensive mistake a UGC product can make, so the editor opens for
 * anyone and only asks for an account at the moment there is something worth
 * keeping. Until then the world lives in localStorage.
 *
 * That storage is the whole safety net for an unclaimed build, so every access
 * is defensive: private mode throws on read, quota throws on write, and a
 * stored doc can be from an older schema or hand-edited. A draft that cannot
 * be read is treated as no draft rather than as an error — the cost is a lost
 * unsaved build, and the alternative is an editor that refuses to open.
 */

/** The id the editor uses for a world that has no database row yet. */
export const DRAFT_ID = "new";

const KEY = "blockworld:draft";

export function loadDraft(): WorldDoc | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    // Validated, not trusted: this string survives deploys, so it can predate
    // the current schema entirely.
    return parseWorldDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraft(doc: WorldDoc): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    /* private mode or quota — the build simply is not persisted */
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to recover */
  }
}

export function hasDraft(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * The doc a brand-new draft starts from.
 *
 * The parkour course, not an empty grid: SPEC §9 #5 and UI spec §6.2 both put
 * blank-canvas paralysis at the top of the first-session drop-off list, and it
 * matters most here, where the visitor has not even signed up yet.
 */
export function newDraftDoc(): WorldDoc {
  return parkourWorldDoc(DRAFT_ID, "", "My first world");
}
