import {
  applyOp,
  docFromState,
  opSchema,
  stateFromDoc,
  type Op,
  type WorldState,
} from "@/lib/ops";
import type { WorldDoc } from "@/lib/worlddoc";

/**
 * The authoritative world, with no Colyseus in sight.
 *
 * Everything that decides whether an edit is allowed lives here: validation,
 * the size caps, the flood limit. BuildRoom is the transport shell around it.
 * Keeping the two apart is what makes the rules testable without a socket, and
 * it is also the honest division — none of this logic is about networking.
 */

/** Mirrors the caps in worldDocSchema: a room must never build a doc the app would reject. */
export const LIMITS = {
  maxParts: 50_000,
  maxProps: 2_000,
  /**
   * Ops per client per second. A drag stroke arrives as ONE composite op, so a
   * human building flat out sends single digits per second; this is set well
   * above that and still far below what it takes to pin the process.
   */
  opsPerSecond: 30,
  /** Burst allowance, so a legitimate flurry of clicks is never punished. */
  burst: 60,
} as const;

export type RejectReason = "invalid" | "rate-limited" | "part-limit" | "prop-limit";

export type SubmitResult =
  | { ok: true; op: Op; revision: number }
  | { ok: false; reason: RejectReason; detail?: string };

/** A token bucket per client. Refills continuously, so it never punishes bursts. */
class Bucket {
  private tokens: number = LIMITS.burst;
  private last: number;
  constructor(now: number) {
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(
      LIMITS.burst,
      this.tokens + ((now - this.last) / 1000) * LIMITS.opsPerSecond
    );
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class WorldSession {
  private state: WorldState;
  private buckets = new Map<string, Bucket>();
  private now: () => number;

  /** Bumped by every accepted edit — the room mirrors it into presence state. */
  revision = 0;
  /** Edits since the last save. 5d reads this to decide whether to write back. */
  dirty = false;

  constructor(
    private base: WorldDoc,
    now: () => number = Date.now
  ) {
    this.state = stateFromDoc(base);
    this.now = now;
  }

  /** The world as a document again — what a joining client gets, and what gets saved. */
  get doc(): WorldDoc {
    return docFromState(this.base, this.state);
  }

  get partCount() {
    return this.state.parts.size;
  }

  get propCount() {
    return this.state.props.length;
  }

  forget(clientId: string) {
    this.buckets.delete(clientId);
  }

  /**
   * Validate an incoming edit and, if it is allowed, apply it. The caller
   * broadcasts the returned op; a rejected op is never seen by anyone else.
   *
   * `raw` is deliberately `unknown`: this is the trust boundary, and typing it
   * as an `Op` here would be a lie about where the data came from.
   */
  submit(clientId: string, raw: unknown): SubmitResult {
    const now = this.now();
    let bucket = this.buckets.get(clientId);
    if (!bucket) {
      bucket = new Bucket(now);
      this.buckets.set(clientId, bucket);
    }
    if (!bucket.take(now)) return { ok: false, reason: "rate-limited" };

    const parsed = opSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, reason: "invalid", detail: parsed.error.issues[0]?.message };
    }
    const op = parsed.data as Op;

    // Growth has to be measured before applying, not after: a doc over the cap
    // would be rejected by the app's own parseWorldDoc at save time, which is
    // the worst possible moment to find out.
    const growth = this.growthOf(op);
    if (this.state.parts.size + growth.parts > LIMITS.maxParts) {
      return { ok: false, reason: "part-limit" };
    }
    if (this.state.props.length + growth.props > LIMITS.maxProps) {
      return { ok: false, reason: "prop-limit" };
    }

    applyOp(this.state, op);
    this.dirty = true;
    this.revision += 1;
    return { ok: true, op, revision: this.revision };
  }

  /** How many parts and props this op would add — negative when it removes. */
  private growthOf(op: Op): { parts: number; props: number } {
    switch (op.t) {
      case "place":
        return { parts: this.state.parts.has(op.key) ? 0 : 1, props: 0 };
      case "erase":
        return { parts: this.state.parts.has(op.key) ? -1 : 0, props: 0 };
      case "prop-add":
        return { parts: 0, props: 1 };
      case "prop-remove":
        return { parts: 0, props: -1 };
      case "composite": {
        // Counted against a scratch set, not the live map: two places on the
        // same cell in one stroke add one part, and a place-then-erase adds none.
        const added = new Set<string>();
        const removed = new Set<string>();
        let props = 0;
        for (const child of op.ops) {
          if (child.t === "place") {
            removed.delete(child.key);
            if (!this.state.parts.has(child.key)) added.add(child.key);
          } else if (child.t === "erase") {
            added.delete(child.key);
            if (this.state.parts.has(child.key)) removed.add(child.key);
          } else if (child.t === "prop-add") props += 1;
          else if (child.t === "prop-remove") props -= 1;
        }
        return { parts: added.size - removed.size, props };
      }
      default:
        return { parts: 0, props: 0 };
    }
  }
}
