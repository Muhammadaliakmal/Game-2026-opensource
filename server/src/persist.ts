import type { WorldDoc } from "@/lib/worlddoc";

/**
 * Getting a room's world back into the database.
 *
 * The room is authoritative while anyone is in it, which means the browser has
 * stopped being the thing that saves — and a room that never wrote back would
 * quietly discard an afternoon of building the moment everyone left.
 *
 * Three rules, and each one exists because the other two are not enough:
 *
 * - **Idle.** Save a few seconds after the last edit, so a placement burst is
 *   one write rather than four hundred.
 * - **A ceiling on the wait.** Someone building continuously never goes idle,
 *   and without this their session would never be saved until it ended.
 * - **On dispose.** The last edits of a session are the ones nobody has seen
 *   written, and disposal is the only moment left to write them.
 *
 * Nothing here knows about Colyseus or HTTP. It is given something dirty and
 * something that can store it, which is what makes the timing testable without
 * a socket or a clock.
 */

/** What persistence needs from a session — WorldSession satisfies it. */
export interface PersistTarget {
  readonly doc: WorldDoc;
  readonly revision: number;
  readonly dirty: boolean;
  markSaved(revision: number): void;
}

export type SaveFn = (worldId: string, doc: WorldDoc) => Promise<void>;

export interface PersistOptions {
  /** Quiet time before a save. */
  idleMs?: number;
  /** Longest an edit may sit unsaved while someone keeps building. */
  maxWaitMs?: number;
  /** Wait before trying again after a failed write. */
  retryMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
}

export const PERSIST_DEFAULTS = {
  idleMs: 5_000,
  maxWaitMs: 30_000,
  retryMs: 5_000,
} as const;

export class WorldPersistence {
  private idleMs: number;
  private maxWaitMs: number;
  private retryMs: number;
  private now: () => number;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (handle: unknown) => void;
  private onError: (error: unknown) => void;

  private timer: unknown = null;
  /** When the oldest unsaved edit arrived — the ceiling is measured from here. */
  private oldestEditAt: number | null = null;
  /** A save in flight. Two concurrent writes of the same world is one too many. */
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private worldId: string,
    private target: PersistTarget,
    private save: SaveFn,
    options: PersistOptions = {}
  ) {
    this.idleMs = options.idleMs ?? PERSIST_DEFAULTS.idleMs;
    this.maxWaitMs = options.maxWaitMs ?? PERSIST_DEFAULTS.maxWaitMs;
    this.retryMs = options.retryMs ?? PERSIST_DEFAULTS.retryMs;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.onError =
      options.onError ??
      ((error) => console.error(`[persist] ${this.worldId} save failed`, error));
  }

  /** Called after every accepted edit. Cheap enough to call on every op. */
  touch() {
    if (this.disposed) return;
    this.oldestEditAt ??= this.now();
    this.schedule();
  }

  /**
   * The next save is whichever comes first: quiet, or the ceiling. Clamped at
   * zero so an edit arriving after the ceiling has already passed saves now
   * rather than being scheduled into the past.
   */
  private schedule() {
    this.cancel();
    const ceiling = (this.oldestEditAt ?? this.now()) + this.maxWaitMs - this.now();
    const delay = Math.max(0, Math.min(this.idleMs, ceiling));
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private cancel() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /**
   * Write now, if there is anything to write. Safe to call at any time: a
   * second caller joins the write already in flight rather than starting a
   * competing one.
   */
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.target.dirty) return Promise.resolve();

    this.cancel();
    // Snapshotted before the await: edits keep arriving during the write, and
    // clearing the dirty flag for a revision that was never sent is how a
    // session ends up silently missing its last few blocks.
    const revision = this.target.revision;
    const doc = this.target.doc;

    this.inFlight = this.save(this.worldId, doc)
      .then(() => {
        this.target.markSaved(revision);
        this.oldestEditAt = this.target.dirty ? this.now() : null;
        // Edits that landed mid-write are still unsaved; go round again.
        if (this.target.dirty && !this.disposed) this.schedule();
      })
      .catch((error) => {
        this.onError(error);
        // The world stays dirty, so the retry writes the newest version rather
        // than the one that failed — which is the right thing to want.
        if (!this.disposed) {
          this.cancel();
          this.timer = this.setTimer(() => {
            this.timer = null;
            void this.flush();
          }, this.retryMs);
        }
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /**
   * Last chance. Awaits any write already running, then writes whatever is
   * still unsaved — including edits that arrived while that write was in the
   * air. After this the room is going away, so a failure here is logged and
   * lost; there is nothing left to retry with.
   */
  async dispose(): Promise<void> {
    this.cancel();
    await this.inFlight?.catch(() => {});
    this.disposed = true;
    if (this.target.dirty) await this.flush();
  }
}
