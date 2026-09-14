"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GAME_INDEX, searchIndex, type GameEntry } from "@/lib/game-index";
import { sfxUiHover, sfxUiOpen, sfxUiReject } from "@/lib/audio";

/**
 * Find a game, or a world somebody made, and open it.
 *
 * ── What it searches ─────────────────────────────────────────────────────
 *
 * Two lists, merged. The site's own games come from `lib/game-index.ts`
 * and match instantly, as you type. Worlds people published come from
 * `/api/worlds/search`, debounced, from the second character on — so
 * typing "lu" shows Ludo before the network has answered, and a world
 * called "Lunar base" lands under it a moment later.
 *
 * ── How it is driven ─────────────────────────────────────────────────────
 *
 * `/` focuses it from anywhere on the page, as on every site with a search
 * worth using. Up and down move a selection, Enter opens it, Escape clears
 * and leaves. The selection is real focus-free state rather than moving DOM
 * focus, so the text stays editable while the arrows move the highlight —
 * `aria-activedescendant` tells a screen reader which row is current.
 *
 * ── The empty state ──────────────────────────────────────────────────────
 *
 * Says what would have matched, and offers the games anyway. "No results"
 * is a dead end; a dead end in a game is a bug.
 */
interface WorldHit {
  id: string;
  name: string;
  plays: number;
  kind: "course" | "world";
}

const KIND_LABEL: Record<GameEntry["kind"], string> = {
  mode: "Mode",
  arcade: "Arcade",
  world: "World",
  course: "Course",
};

const MAX_ROWS = 8;

export function GameSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // The rows AND the query they answer, as one value. Two reasons it is not
  // just the rows: an effect may not clear state synchronously (the repo's
  // `set-state-in-effect` rule), and rows fetched for "lunar" must not sit
  // under a box that now reads "lunarx". Held while the answered query is
  // still a prefix of what is typed, so refining a search does not blink the
  // list away and fetch it straight back.
  const [hits, setHits] = useState<{ q: string; rows: WorldHit[] }>({ q: "", rows: [] });
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);

  const typed = query.trim();
  const worlds = typed.length >= 2 && typed.toLowerCase().startsWith(hits.q.toLowerCase())
    ? hits.rows
    : [];

  const local = searchIndex(query);
  const remote: GameEntry[] = worlds
    // A built-in already listed by name is not listed twice.
    .filter((w) => !local.some((l) => l.title.toLowerCase() === w.name.toLowerCase()))
    .map((w) => ({
      href: `/play/${w.id}`,
      title: w.name,
      blurb: `${w.kind === "course" ? "A course" : "A world"} somebody made · ${w.plays.toLocaleString()} plays`,
      kind: w.kind,
      terms: [],
    }));
  const rows = [...local, ...remote].slice(0, MAX_ROWS);
  const active = Math.min(cursor, Math.max(0, rows.length - 1));
  const showing = open && query.trim().length > 0;

  // The network half, debounced. Nothing is cleared here — an answer carries
  // the query it answers, and the render above decides whether it still
  // applies. A stale answer for "lu" landing after the box is emptied is
  // therefore inert rather than something to race.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/worlds/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setHits({ q, rows: (await res.json()) as WorldHit[] });
      } catch {
        // Aborted or offline: the local half is still a search.
      }
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [query]);

  // `/` from anywhere on the page. Not while typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (entry: GameEntry) => {
    sfxUiOpen();
    setOpen(false);
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length) {
        setCursor((c) => (c + 1) % rows.length);
        sfxUiHover();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) {
        setCursor((c) => (c - 1 + rows.length) % rows.length);
        sfxUiHover();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) go(rows[active]);
      else if (query.trim()) sfxUiReject();
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else input.current?.blur();
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full sm:max-w-md">
      <div className="chamfer chamfer-edge chamfer-edge--focus">
        <div className="chamfer bg-panel flex items-center gap-2 px-3">
          <svg
            viewBox="0 0 16 16"
            className="text-dim h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={showing}
            aria-controls={listId}
            aria-activedescendant={showing && rows[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="Find a game or a world…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // After the click on a row has had its turn.
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
            className="text-ink placeholder:text-dim min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
          />
          <kbd className="hud-label text-dim hidden shrink-0 sm:inline" aria-hidden>
            /
          </kbd>
        </div>
      </div>

      {showing && (
        <div
          id={listId}
          role="listbox"
          className="panel-enter absolute inset-x-0 top-full z-30 mt-2"
        >
          <div className="chamfer chamfer-edge">
            <div className="chamfer bg-panel flex flex-col p-1">
              {rows.length === 0 ? (
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-ink text-sm font-semibold">
                    Nothing called &ldquo;{query.trim()}&rdquo;.
                  </p>
                  <p className="text-dim text-xs">
                    Try a mode, a cabinet, or the name of a world. Or pick one of these:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {GAME_INDEX.slice(0, 4).map((e) => (
                      <button
                        key={e.href}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => go(e)}
                        className="hud-chip"
                      >
                        {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                rows.map((e, i) => (
                  <button
                    key={e.href}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    type="button"
                    // Keep the input focused through the click, so onBlur's
                    // close does not race the navigation.
                    onMouseDown={(ev) => ev.preventDefault()}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(e)}
                    className={`flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-left transition-colors ${
                      i === active ? "bg-accent/15" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-ink truncate text-sm font-semibold">{e.title}</span>
                      <span className="text-dim truncate text-xs">{e.blurb}</span>
                    </span>
                    <span className="hud-label text-dim shrink-0">{KIND_LABEL[e.kind]}</span>
                    {i === active && (
                      <span className="hud-label text-accent hidden shrink-0 sm:inline" aria-hidden>
                        ↵
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
