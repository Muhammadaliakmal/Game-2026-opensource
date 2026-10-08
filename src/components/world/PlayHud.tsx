"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { recenterPitch, useViewStore } from "@/components/play/camera-rig";
import { useMoveMode } from "@/components/play/move-mode";
import {
  onRespawned,
  requestRespawn,
  requestRestart,
} from "@/components/play/play-actions";
import { formatTime, runAuthorMs, useCourse } from "@/components/play/course";
import { MEDAL_LABELS, medalForAuthor, medalTimesFor, nextMedalFor } from "@/lib/medals";
import { DiscordNudge } from "@/components/hud/DiscordNudge";
import { useRuns, type BoardPeriod, type BoardRow } from "@/lib/runs";
import { sfxCourseComplete, sfxMedal, sfxPersonalBest } from "@/lib/sfx/parkour";
import { sfxUiConfirm, sfxUiTick } from "@/lib/audio";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { RemixButton } from "@/components/RemixButton";
import { HudZone, HudZones } from "@/components/hud/HudZones";
import { TogetherChip } from "./TogetherChip";
import { MenuIcon } from "@/components/hud/MenuIcon";
import { SettingsButton } from "@/components/hud/SettingsButton";
import { ControlArranger } from "@/components/hud/ControlArranger";
import { useHudOverlay } from "@/lib/hud-overlay";
import { UGC } from "@/lib/features";
import { CoinIcon } from "@/components/hud/CoinIcon";
import { ReviveOffer } from "@/components/play/ReviveOffer";

/**
 * The Play HUD.
 *
 * Deliberately close to nothing (UI spec §3.3): a platformer's screen belongs
 * to the world, not to chrome. Everything that is not the world now sits
 * behind one icon — on a phone the old row of chips ran the full width under
 * the world name and took roughly a third of the screen, which is a lot of a
 * game to spend on controls nobody touches while actually playing.
 *
 * DOM rather than in-scene UI, and `pointer-events-none` on the container with
 * each control re-enabling itself, so invisible padding can never swallow a
 * click meant for the world.
 *
 * Placement is the platformer convention, via HudZones: identity and the run
 * clock top-left, everything you can press behind one icon top-right, hints
 * top-center where the eye already is, and the keyboard legend bottom-center.
 * The mode accent is the parkour acid green.
 */
export function PlayHud({
  name,
  canEdit,
  worldId,
  isDraft,
  onEdit,
  showKeyboardLegend,
}: {
  name: string;
  canEdit: boolean;
  worldId: string;
  isDraft: boolean;
  onEdit: () => void;
  showKeyboardLegend: boolean;
}) {
  return (
    <>
      {/* Outside the grid, and first: a full-screen wash is not a panel, and
          inside the safe-area insets it would leave an undimmed frame. The
          HUD carries the same z-10 so it stays legible through the wash —
          the fade dims the world you fell out of, not the way back in. */}
      <RespawnFade />

      {/* Outside the grid too, and above it: the arrange bar has to sit
          over the controls it is editing. Renders nothing unless the
          player asked for it from Settings. */}
      <ControlArranger />

      <HudZones mode="parkour" className="z-10">
        <HudZone at="top-left">
          {/*
            The clock and the checkpoint pips, and no longer the world's name.

            The name was a permanent panel showing a value that never changes
            while you play it — which is the definition of something that
            belongs behind a menu rather than on the screen. On a phone it was
            also the widest thing in the corner, and on the installed app it
            sat directly under the site header and read as a second title bar.
            It is in the menu and in Settings now, both of which are places you
            open when you want to know where you are.
          */}
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            <RunTimer />
            <CheckpointPips />
          </div>
          {/* Other people on this course, on their own phones. */}
          <TogetherChip worldId={worldId} isDraft={isDraft} />
        </HudZone>

        {/* Transient hints, stacked in the order they can appear. The zone
            spaces them; neither has to know the other exists any more. */}
        <HudZone at="top-center">
          {canEdit && <EscHint />}
          <LockOnBadge />
        </HudZone>

        <HudZone at="top-right">
          {/* The gear sits beside the menu rather than inside it: settings is
              the one row that opens a screen of its own, and a menu that stays
              open behind a modal reads as two things being open at once. */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <SettingsButton
              className="hud-chip hud-chip--icon hud-chip--touch"
              title={name}
            />
            <PlayMenu
              name={name}
              canEdit={canEdit}
              worldId={worldId}
              isDraft={isDraft}
              onEdit={onEdit}
            />
          </div>
        </HudZone>

        <HudZone at="center">
          <CourseComplete canEdit={canEdit} onEdit={onEdit} />
        </HudZone>

        {/* The keyboard legend is noise once thumb controls are on screen — and
            it would sit right under the joystick. */}
        {showKeyboardLegend && (
          <HudZone at="bottom-center">
            <div className="hud-panel flex items-center gap-2.5 px-3 py-2">
              {[
                ["WASD", "move"],
                ["Click", "aim"],
                ["Shift", "lock on"],
                ["Space", "jump"],
                ["V", "view"],
                ["R", "respawn"],
              ].map(([key, action]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="bg-surface text-ink rounded-[var(--radius)] px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-white/10">
                    {key}
                  </kbd>
                  <span className="hud-label">{action}</span>
                </span>
              ))}
            </div>
          </HudZone>
        )}
      </HudZones>
      {/* After a fall: one rewarded ad puts the runner back where they were. */}
      <ReviveOffer />
    </>
  );
}

/**
 * The run clock, for worlds that are courses.
 *
 * Ticks on an interval rather than a frame loop: the display only changes in
 * hundredths, a 60Hz re-render of a DOM node would be 55 wasted renders a
 * second, and the clock itself is a timestamp in the store — this only decides
 * how often anyone looks at it.
 */
function RunTimer() {
  const startedAt = useCourse((s) => s.startedAt);
  const finishedMs = useCourse((s) => s.finishedMs);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null || finishedMs !== null) return;
    // The clock is read here and never during render. A render may happen at
    // any moment for reasons that have nothing to do with time, and it has to
    // produce the same output for the same state — so the elapsed value is
    // sampled on a schedule we control and held in state.
    const id = setInterval(
      () => setElapsed(performance.now() - startedAt),
      60
    );
    return () => clearInterval(id);
  }, [startedAt, finishedMs]);

  if (startedAt === null) return null;
  const ms = finishedMs ?? elapsed;

  return (
    <div className="hud-panel hud-panel--readout flex shrink-0 flex-col items-start px-3 py-2">
      <span className="num text-2xs font-medium">{formatTime(ms)}</span>
      {finishedMs === null && <PaceLine elapsed={elapsed} />}
      <GhostLine />
    </div>
  );
}

/**
 * The medal still on, and how long it stays on.
 *
 * "Gold · 4.20s" means: cross the line within 4.20 seconds and it is Gold.
 * The run clock alone says how long you have taken; this says what it is
 * worth, which is the number that makes the last gap feel like something. It
 * counts down through the ladder — when the Gold window closes the line
 * becomes Silver's — and goes quiet once no medal is left rather than
 * announcing the fact, because the clock is already doing that.
 *
 * Derived from the same elapsed sample the clock draws, so the two cannot
 * disagree by a frame.
 */
function PaceLine({ elapsed }: { elapsed: number }) {
  const authorMs = useCourse(runAuthorMs);
  if (authorMs === null) return null;
  const onPace = medalForAuthor(authorMs, elapsed);
  if (onPace === null) return null;
  const threshold = medalTimesFor(authorMs).find((t) => t.medal === onPace)!.ms;
  const left = threshold - elapsed;
  return (
    <span className="hud-label num text-[10px] leading-tight">
      {MEDAL_LABELS[onPace]} · {(left / 1000).toFixed(2)}s
    </span>
  );
}

/**
 * Who the translucent runner up ahead is.
 *
 * A ghost with no name attached is a bug report — "there is a blue person on
 * my course" — so the one line that turns it into a feature goes under the
 * clock, which is where the eye already is and where the time it is worth
 * comparing against is already displayed.
 *
 * No delta. "You are 4.2s behind" needs a shared notion of progress along the
 * course, and this game measures progress in checkpoints, which are far too
 * coarse to subtract times at. The figure on screen already answers the
 * question more precisely than a number could.
 */
function GhostLine() {
  const name = useRuns((s) => s.ghostName);
  const ms = useRuns((s) => s.ghostMs);
  const has = useRuns((s) => s.ghost !== null);
  if (!has || ms === null) return null;
  return (
    <span className="hud-label num text-[10px] leading-tight">
      ◇ {name ?? "Ghost"} {formatTime(ms)}
    </span>
  );
}

/**
 * How far through the course you have banked.
 *
 * The gates already confirm a checkpoint as you cross one — a sound, a buzz,
 * and the ring going still. None of that answers the question you have thirty
 * seconds later, which is how many are left, so this is the only part of the
 * mechanic that persists on screen.
 *
 * Pips rather than "2/5" because the count is small by construction (the
 * schema caps checkpoints at 64, but a course that uses more than a handful
 * has stopped being a course), and a row of shapes is read without counting.
 * Worlds with no checkpoints render nothing at all rather than an empty row.
 */
function CheckpointPips() {
  const count = useCourse((s) => s.checkpointCount);
  const held = useCourse((s) => s.checkpoint);
  if (count === 0) return null;

  return (
    <div
      className="hud-panel hud-panel--readout flex shrink-0 items-center gap-1 px-3 py-2"
      // One label for the row: a screen reader announcing eight list items
      // called "checkpoint" is worse than silence.
      role="img"
      aria-label={`Checkpoint ${held + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={
            i <= held
              ? "bg-accent h-1.5 w-1.5 rounded-full"
              : "h-1.5 w-1.5 rounded-full bg-white/20"
          }
        />
      ))}
    </div>
  );
}

/**
 * The end of a run.
 *
 * A panel rather than the wash used for respawns: SPEC bans modals for things
 * that interrupt play, and this is the opposite case — play is over, and the
 * one moment a course has earned the screen is the moment you finish it.
 *
 * It does not stop the character. You keep control of the world behind it, so
 * the panel is a result and not a cage, and "Run again" is a respawn rather
 * than a reload — the same quarter-second cost as any other attempt.
 */
/**
 * The global board, on the panel that already exists.
 *
 * ── Why here and not a page of its own ───────────────────────────────────
 *
 * The one moment a player cares where they stand is the moment they have just
 * finished. A separate screen would be somewhere they have to decide to go,
 * which is the same as somewhere they never go — and it would compete with
 * "Run again", which is the button this panel exists to offer.
 *
 * Deliberately short. Five rows plus your own is a thing you read; a
 * scrollable fifty is a thing you close.
 */
const BOARD_ROWS = 5;

function Leaderboard() {
  const board = useRuns((s) => s.board);
  const period = useRuns((s) => s.period);
  const loading = useRuns((s) => s.loading);
  const error = useRuns((s) => s.error);
  const submitting = useRuns((s) => s.submitting);

  if (loading || submitting) {
    return <span className="hud-label">Posting your run…</span>;
  }
  if (error) return <span className="hud-label">{error}</span>;
  if (!board) return null;

  const top = board.top.slice(0, BOARD_ROWS);
  // Your own row, appended when the top few do not already contain it — the
  // half of a leaderboard that matters once you are off the bottom of it.
  const mine =
    board.me && !top.some((r) => r.userId === board.me!.userId)
      ? board.me
      : null;

  return (
    <div className="flex w-full flex-col gap-1">
      {/* All time, or this week. The weekly board is the one a new player can
          get onto: a global all-time top five on a year-old course is five
          names that will never move. Monday it is empty for everybody. */}
      <div className="flex items-center justify-between gap-2">
        <span className="hud-label">Fastest runs</span>
        <PeriodToggle period={period} />
      </div>
      {/* An empty board is only worth a line when it is the weekly one —
          "nobody yet this week" is an invitation; an empty all-time board on
          a course you just finished cannot happen. */}
      {top.length === 0 && (
        <span className="text-dim text-xs">Nobody yet this week. You could be first.</span>
      )}
      {top.map((row, i) => (
        <BoardLine
          key={row.userId}
          rank={i + 1}
          row={row}
          you={row.userId === board.me?.userId}
        />
      ))}
      {mine && (
        <>
          <span className="text-dim text-center text-[10px] leading-none">
            ⋯
          </span>
          <BoardLine rank={board.rank ?? 0} row={mine} you />
        </>
      )}
    </div>
  );
}

function PeriodToggle({ period }: { period: BoardPeriod }) {
  const pick = (p: BoardPeriod) => () => {
    sfxUiTick();
    void useRuns.getState().setPeriod(p);
  };
  const chip = (p: BoardPeriod, label: string) => (
    <button
      onClick={pick(p)}
      className={`hud-label rounded-[var(--radius)] px-1.5 py-0.5 transition-colors ${
        period === p ? "text-accent bg-white/10" : "hover:text-ink"
      }`}
      aria-pressed={period === p}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Board period">
      {chip("all", "All time")}
      {chip("week", "This week")}
    </div>
  );
}

function BoardLine({
  rank,
  row,
  you,
}: {
  rank: number;
  row: BoardRow;
  you: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-2 text-xs ${
        you ? "text-accent" : "text-dim"
      }`}
    >
      <span className="num w-5 shrink-0 text-right opacity-70">{rank}</span>
      <span className="min-w-0 flex-1 truncate text-left">{row.name}</span>
      <span className="num shrink-0">{formatTime(row.timeMs)}</span>
    </div>
  );
}

function CourseComplete({
  canEdit,
  onEdit,
}: {
  canEdit: boolean;
  onEdit: () => void;
}) {
  const finishedMs = useCourse((s) => s.finishedMs);
  const best = useCourse((s) => s.best);
  const worldId = useCourse((s) => s.worldId);
  const authorMs = useCourse(runAuthorMs);
  const earned = useRuns((s) => s.earned);
  const lucky = useRuns((s) => s.lucky);
  const daily = useRuns((s) => s.daily);

  const isBest =
    finishedMs !== null && best !== null && Math.abs(best - finishedMs) < 1;
  // Any course has medal times, shipped or built, because they are multiples
  // of an Author time derived from the geometry rather than a table keyed by
  // slug. A world with no goal is not a course and still has none — it cannot
  // be finished, so this panel never opens for one.
  const medal = finishedMs === null ? null : medalForAuthor(authorMs, finishedMs);

  // The stinger, once per finish. Keyed on the time rather than on mount
  // because the panel is conditionally rendered on the same value and a
  // re-render must not replay it. Completion first, then the medal, then the
  // record — each scheduled after the last on the audio clock, so the three
  // read as one phrase rather than three components each making a noise.
  useEffect(() => {
    if (finishedMs === null) return;
    sfxCourseComplete();
    if (medal) sfxMedal(medal, 0.85);
    if (isBest) sfxPersonalBest(medal ? 1.6 : 0.85);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one phrase per finish
  }, [finishedMs]);

  if (finishedMs === null) return null;
  const chase = nextMedalFor(authorMs, medal);

  return (
    <div className="hud-panel panel-enter pointer-events-auto flex w-full max-w-xs flex-col items-center gap-4 px-6 py-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="hud-label">Course complete</span>
        <span className="hud-readout text-accent text-3xl font-semibold">
          {formatTime(finishedMs)}
        </span>
      </div>

      {/* A best time only means something once there is a previous one to
          beat, so the first run says nothing rather than congratulating
          itself for being the only entry. */}
      {best !== null && (
        <span className="hud-label">
          {isBest ? "New best time" : `Best ${formatTime(best)}`}
        </span>
      )}

      {/* Beneath the time, and only after a best or a medal — at most once a
          week, and never after a run that ended in a fall. The conditions are
          in `lib/discord.ts`; this panel only reports the two facts it already
          has. */}
      <DiscordNudge finished personalBest={isBest} medal={medal} />

      {/* The medal, then the next one up — a result with nothing to chase
          after it is a scoreboard rather than a reason to press Run again. */}
      {medal && (
        <span className="hud-readout text-accent text-sm font-semibold">
          {MEDAL_LABELS[medal]} medal
        </span>
      )}
      {chase && (
        <span className="hud-label num">
          {MEDAL_LABELS[chase.medal]} at {formatTime(chase.ms)}
        </span>
      )}

      <GhostDelta finishedMs={finishedMs} />
      <Deaths />

      {/* Only when something was actually earned. A course pays for reaching a
          medal tier the first time and nothing for running it again, so on
          most attempts this is absent — which is the honest way to show a rule
          whose whole point is that repetition is worth nothing. A lucky run
          says so beside the number rather than instead of it: the surprise is
          the doubling, and a doubling needs the number to read as one. */}
      {earned !== null && (
        <span className="hud-readout text-accent num text-sm font-semibold">
          <span className="inline-flex items-center gap-1">+ <CoinIcon size={16} /> {earned}</span>
          {lucky && <span className="ml-2 tracking-widest">LUCKY RUN ×2</span>}
        </span>
      )}
      {daily !== null && (
        <span className="hud-label num"><span className="inline-flex items-center gap-1">Daily challenge + <CoinIcon size={14} /> {daily}</span></span>
      )}

      <Leaderboard />

      <NextCourse worldId={worldId} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* A restart, not a respawn. Respawning here would resume at the last
            checkpoint of a run that is already over: the clock would stay
            stopped, this panel would stay up, and the button would appear to
            do nothing at all. */}
        <button
          onClick={requestRestart}
          className="hud-chip hud-chip--primary"
          autoFocus
        >
          Run again
        </button>
        <ShareRun worldId={worldId} />
        {canEdit && (
          <button onClick={onEdit} className="hud-chip">
            Edit
          </button>
        )}
        <Link href="/" className="hud-chip">
          Exit
        </Link>
      </div>
    </div>
  );
}

/**
 * How many times the run died on the way. An obby is scored in deaths as
 * much as in seconds, and a clean run says so with the only number that
 * feels better than a fast one.
 */
function Deaths() {
  const deaths = useCourse((s) => s.deaths);
  if (deaths === 0) return <span className="hud-label text-accent">Deathless</span>;
  return (
    <span className="hud-label num">
      Died {deaths} {deaths === 1 ? "time" : "times"}
    </span>
  );
}

/**
 * How the run went against the ghost.
 *
 * A near miss is the most motivating result there is — more than a clean
 * win, and far more than a clean loss — and "beaten by 0.31s" is the one line
 * that turns a figure you were chasing into a reason to press Run again. It
 * names the runner, because the ghost's own line under the clock does, and
 * calls your own replay "your ghost" rather than repeating your name at you.
 */
function GhostDelta({ finishedMs }: { finishedMs: number }) {
  const ghostMs = useRuns((s) => s.ghostMs);
  const name = useRuns((s) => s.ghostName);
  const who = useRuns((s) => s.ghostWho);
  if (ghostMs === null) return null;
  const gap = Math.abs(ghostMs - finishedMs) / 1000;
  const them = who === "me" ? "your ghost" : (name ?? "the ghost");
  const won = ghostMs > finishedMs;
  return (
    <span className={`hud-label num ${won ? "text-accent" : ""}`}>
      {won ? `Beat ${them} by ${gap.toFixed(2)}s` : `${them} had you by ${gap.toFixed(2)}s`}
    </span>
  );
}

/**
 * "Beat my time" — one press, one link.
 *
 * The link is the course with `?vs=<you>` on it, which loads your best as
 * the ghost for whoever opens it (`RunRecorder`). Who "you" are comes from
 * the session, not from the board row: on the weekly board a player with no
 * run this week has no row, and the button must not vanish with it. A
 * signed-out player has no run on the server for a link to point at, so
 * they do not get the button. The system share sheet where there is one (a
 * phone), the clipboard where there is not.
 */
function ShareRun({ worldId }: { worldId: string | null }) {
  const { userId } = useAuth();
  // The server's number when the board has it, the browser's otherwise: the
  // link races what the server holds, and the two agree except in the
  // moment before a post has landed.
  const posted = useRuns((s) => s.board?.me?.timeMs ?? null);
  const local = useCourse((s) => s.best);
  const best = posted ?? local;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!userId || !worldId || best === null) return null;

  const share = async () => {
    const url = `${window.location.origin}/play/${encodeURIComponent(worldId)}?vs=${encodeURIComponent(userId)}`;
    const text = `Beat my ${formatTime(best)} on Spec Driven Games`;
    sfxUiConfirm();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: text, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // A dismissed share sheet or a refused clipboard is not an error the
      // player needs to hear about.
    }
  };

  return (
    <button onClick={share} className="hud-chip" title="Copy a link that races your best">
      {copied ? "Link copied" : "Beat my time"}
    </button>
  );
}

/** Seconds the next course waits before it is chosen for you. */
const NEXT_COUNTDOWN = 6;

/**
 * One more run.
 *
 * The course after this one on the ladder, offered with a countdown — a
 * default rather than a demand. Any press or key anywhere stops it, so a
 * player reading the board or reaching for Run again is never carried off
 * mid-thought; only someone who has stopped touching anything is taken to
 * the next course. A course somebody built has no "next", and neither does
 * the last one on the ladder.
 */
function NextCourse({ worldId }: { worldId: string | null }) {
  const router = useRouter();
  const index = PARKOUR_COURSES.findIndex((c) => c.slug === worldId);
  const next = index >= 0 ? PARKOUR_COURSES[index + 1] : undefined;
  const [left, setLeft] = useState<number | null>(NEXT_COUNTDOWN);
  const armed = left !== null;

  useEffect(() => {
    if (!next || !armed) return;
    const stop = () => setLeft(null);
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    const tick = setInterval(() => {
      setLeft((n) => (n === null ? null : n - 1));
    }, 1000);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
  }, [next, armed]);

  useEffect(() => {
    if (!next || left !== 0) return;
    router.push(`/play/${next.slug}`);
  }, [left, next, router]);

  if (!next) return null;
  return (
    <Link
      href={`/play/${next.slug}`}
      className="hud-label num text-accent hover:brightness-110"
      onClick={() => setLeft(null)}
    >
      Next: {next.name} {armed && left > 0 ? `in ${left}…` : "→"}
    </Link>
  );
}

/**
 * Everything that used to be a chip in the top bar.
 *
 * One-shot actions close the menu on their way out — you asked for a thing and
 * the chrome's job is finished. Toggles deliberately leave it open, because
 * the reason to open a menu for a toggle is usually to change it and look, and
 * having to reopen it to flip back is the annoying half of that interaction.
 */
function PlayMenu({
  name,
  canEdit,
  worldId,
  isDraft,
  onEdit,
}: {
  name: string;
  canEdit: boolean;
  worldId: string;
  isDraft: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /*
   * Published so the touch controls can leave the screen while this is open —
   * see lib/hud-overlay. From an effect rather than the click handler because
   * four different things close this menu (Escape, an outside press, a
   * one-shot action, navigating away) and only an effect is guaranteed to see
   * all of them.
   */
  useEffect(() => {
    useHudOverlay.getState().setMenu(open);
    return () => useHudOverlay.getState().setMenu(false);
  }, [open]);

  const firstPerson = useViewStore((s) => s.firstPerson);
  const toggleFirstPerson = useViewStore((s) => s.toggleFirstPerson);
  // A run clock only exists on a world with a goal — see WorldDoc.goal.
  const onCourse = useCourse((s) => s.startedAt !== null);

  // Leaving the game while still fullscreen strands the user in a chromeless
  // window, so drop out of it on the way to another route.
  const leaveFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
  };

  /** Run a one-shot action and get the chrome back off the screen. */
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  useEffect(() => {
    if (!open) return;

    /**
     * Esc closes the menu, and must not also leave Play.
     *
     * WorldCanvas binds Escape on `window` to drop back into the editor, so
     * without this one key would do both. Bound in the CAPTURE phase, which
     * precedes every bubble listener in the dispatch, so stopping propagation
     * here reliably wins — leaning on React effect ordering (a child's effect
     * runs before its parent's) would happen to work today and break silently
     * the moment the tree is reorganised.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    /** A press anywhere else — including on the world itself — dismisses it. */
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="pointer-events-auto relative shrink-0">
      <button
        ref={trigger}
        onClick={() => setOpen((v) => !v)}
        className={`hud-chip ${open ? "is-active" : ""}`}
        aria-expanded={open}
        aria-controls="play-menu"
        aria-label="Game menu"
        title="Game menu"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {/* The word is affordance on a desktop and clutter on a phone, where
            the icon is doing the job and every pixel is world. */}
        <span className="hidden sm:inline">Menu</span>
      </button>

      {open && (
        /*
          Centred on the screen, over a scrim, rather than hung under its own
          trigger in the top-right corner.

          It was a dropdown, and on a phone that put a 208px panel directly on
          top of the right thumb cluster — the RUN and JUMP buttons showed
          through it, and a thumb going for "Respawn" landed on JUMP as often
          as not. Centring it is the same decision SettingsDialog already made
          for the same reason, and pairing it with the scrim means the menu
          reads as the interruption it is instead of as a label floating over a
          game that is still being played.
        */
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center p-4"
          style={{ background: "rgb(4 4 8 / 0.66)" }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
        <div
          id="play-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Game menu"
          className="hud-panel hud-panel--modal panel-enter flex w-[min(88vw,17rem)] flex-col p-1.5"
        >
          {/* The world's name, at the top of the thing that acts on it. It is
              also a title for the dialog, which a centred panel needs and a
              dropdown hanging off a labelled button did not. */}
          <div className="flex min-w-0 items-center gap-2 px-2.5 pt-1.5 pb-2.5">
            <span className="bg-accent h-1.5 w-1.5 shrink-0" aria-hidden />
            <span className="text-ink min-w-0 truncate text-2xs font-semibold">
              {name}
            </span>
          </div>
          <div className="hud-menu-sep" aria-hidden />
          <button
            onClick={toggleFirstPerson}
            className={`hud-menu-item ${firstPerson ? "is-active" : ""}`}
            title="Switch between first and third person (V)"
          >
            <MenuIcon name="view" />
            View
            <span className="hud-menu-state">
              {firstPerson ? "First person" : "Third person"}
            </span>
          </button>
          <button
            onClick={act(recenterPitch)}
            className="hud-menu-item"
            title="Level the view (C)"
          >
            <MenuIcon name="level" />
            Level the view
          </button>
          <button
            onClick={act(requestRespawn)}
            className="hud-menu-item"
            title="Back to the last checkpoint (R)"
          >
            <MenuIcon name="respawn" />
            Respawn
          </button>
          {/* Only on a course, and only once one has started: on a sandbox
              world there is no run to throw away, and the entry would be a
              second Respawn with a scarier name. */}
          {onCourse && (
            <button
              onClick={act(requestRestart)}
              className="hud-menu-item"
              title="Start the course over, clock from zero (T)"
            >
              <MenuIcon name="restart" />
              Restart run
            </button>
          )}

          <div className="hud-menu-sep" aria-hidden />

          <MuteButton className="hud-menu-item" label="Sound" />
          <FullscreenButton className="hud-menu-item" label="Fullscreen" />

          <div className="hud-menu-sep" aria-hidden />

          {canEdit ? (
            // No navigation: the editor is the same canvas, one mode away.
            <button
                onClick={act(onEdit)}
              className="hud-menu-item"
              title="Back to building (Esc)"
            >
              <MenuIcon name="edit" />
              Edit
            </button>
          ) : (
            // Someone who just played a world they like should be one click
            // from building on it — that fork is the whole share loop, and it
            // closes with the builder (lib/features). A door into the editor
            // from inside a session is the same mistake as one on the home
            // page, and harder to notice.
            UGC && !isDraft && (
              <RemixButton from={worldId} name={name} className="hud-menu-item" />
            )
          )}
          <Link
            href="/"
            onClick={() => {
              setOpen(false);
              leaveFullscreen();
            }}
            className="hud-menu-item"
            title="Leave the game"
          >
            <MenuIcon name="exit" />
            Exit
          </Link>
        </div>
        </div>
      )}
    </div>
  );
}

/**
 * The lock-on readout.
 *
 * Shift changes how the character relates to the camera, and a mode you can
 * enter by accident and cannot see is a mode that reads as a bug — the player
 * strafes past a ledge wondering why the body will not turn. One chip, only
 * while it is on, in the corner the thumb controls do not use.
 */
function LockOnBadge() {
  const lockedOn = useMoveMode((s) => s.lockedOn);
  if (!lockedOn) return null;

  return (
    // No coordinates any more: this used to be pinned at top-28 to dodge the
    // "Esc to edit" hint at top-16, which is exactly the sort of arithmetic
    // between two components that the top-center zone now does for them.
    <div className="hud-panel border-accent/60 text-accent flex items-center gap-2 border px-3 py-1.5 text-2xs font-semibold tracking-widest">
      <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden />
      LOCK ON
    </div>
  );
}

/** "Esc to edit", once, then out of the way. */
function EscHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`hud-panel text-dim px-3 py-2 text-2xs transition-opacity duration-500 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      Esc to edit
    </div>
  );
}

/**
 * A brief wash on respawn instead of a modal.
 *
 * UI spec §3.3 is explicit that a modal kills the flow of a platformer, and
 * SPEC §8 puts the respawn delay at a quarter of a second precisely so failure
 * costs nothing. Anything that has to be dismissed would cost more than the
 * fall did.
 */
function RespawnFade() {
  const [visible, setVisible] = useState(false);
  const [burned, setBurned] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onRespawned((cause) => {
      // The lava's wash is red, and a shade longer: a death by a thing you
      // touched should look different from a fall off the edge, or the
      // player cannot learn which one it was.
      setBurned(cause === "hazard");
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), cause === "hazard" ? 260 : 180);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${
        burned ? "" : "bg-base"
      } ${visible ? "opacity-60" : "opacity-0"}`}
      style={burned ? { background: "rgb(190 40 20)" } : undefined}
    />
  );
}
