/**
 * What the arcade remembers between sessions.
 *
 * ── Local, and versioned from day one ────────────────────────────────────
 *
 * Best scores are per-device and unsigned, which is the honest trade for
 * needing no account to play a cabinet. The key carries its version because
 * the alternative to migrating is silently resetting somebody's records the
 * first time a field is added, and a high score you lost to a deploy is worse
 * than one you never had.
 *
 * ── What is NOT here ─────────────────────────────────────────────────────
 *
 * Coins. A balance a client keeps is a balance a client writes, which is the
 * same argument `db/schema.ts` makes for the `players` row. What lives here is
 * the day's *bookkeeping* — how much has been paid out today, so the client
 * can show an honest "capped for today" without asking the server. The server
 * enforces the cap itself; this copy is for the UI, not for the ledger.
 */

const KEY = "blockworld.arcade.v1";

export interface ArcadeSave {
  v: 1;
  best: Record<string, number>;
  totalRuns: Record<string, number>;
  coinsEarnedToday: number;
  /** ISO date (YYYY-MM-DD) the counter above belongs to. */
  lastPlayDate: string;
}

const FRESH: ArcadeSave = {
  v: 1,
  best: {},
  totalRuns: {},
  coinsEarnedToday: 0,
  lastPlayDate: "",
};

/** Local date, not UTC: a daily cap should roll over at the player's midnight. */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Roll the day over if the save is from a previous one. Pure, so it is tested. */
export function rolled(save: ArcadeSave, date: string): ArcadeSave {
  if (save.lastPlayDate === date) return save;
  return { ...save, coinsEarnedToday: 0, lastPlayDate: date };
}

export function load(): ArcadeSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...FRESH, lastPlayDate: today() };
    const parsed = JSON.parse(raw) as Partial<ArcadeSave>;
    // A shape that is not this version is not migrated blindly — every field
    // is taken defensively, so a hand-edited or half-written record degrades
    // to the starting state rather than throwing inside a render.
    return rolled(
      {
        v: 1,
        best: typeof parsed.best === "object" && parsed.best ? parsed.best : {},
        totalRuns:
          typeof parsed.totalRuns === "object" && parsed.totalRuns
            ? parsed.totalRuns
            : {},
        coinsEarnedToday:
          typeof parsed.coinsEarnedToday === "number" ? parsed.coinsEarnedToday : 0,
        lastPlayDate:
          typeof parsed.lastPlayDate === "string" ? parsed.lastPlayDate : "",
      },
      today()
    );
  } catch {
    // Storage throws outright in some privacy modes rather than returning null.
    return { ...FRESH, lastPlayDate: today() };
  }
}

export function save(next: ArcadeSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* nothing to recover: the records are a convenience, not the game */
  }
}

/** Record a finished run. Returns the updated save; `best` only ever rises. */
export function recordRun(
  prev: ArcadeSave,
  gameId: string,
  score: number,
  coins: number,
  date = today()
): ArcadeSave {
  const s = rolled(prev, date);
  return {
    ...s,
    best: { ...s.best, [gameId]: Math.max(s.best[gameId] ?? 0, score) },
    totalRuns: { ...s.totalRuns, [gameId]: (s.totalRuns[gameId] ?? 0) + 1 },
    coinsEarnedToday: s.coinsEarnedToday + Math.max(0, coins),
  };
}
