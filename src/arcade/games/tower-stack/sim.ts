import * as T from "./tuning";

/**
 * Tower Stack's simulation.
 *
 * ── The tower is a ring, not a list ──────────────────────────────────────
 *
 * A tower grows without limit and a screen shows twenty-six rows of it, so
 * keeping every row would be a array that grows for the length of the session
 * to hold data nothing reads. `rows` is a fixed ring of the most recent
 * `VISIBLE_ROWS`, and `placed` counts the rest. The score comes from the
 * counter, the picture comes from the ring, and neither needs the other.
 *
 * ── The perfect window is the whole design ───────────────────────────────
 *
 * Without it every drop shaves the block, every tower is a losing race
 * against its own width, and the run ends the same way however well it was
 * played. With it, a good player's tower gets *wider*, and the game becomes
 * about holding a rhythm rather than about how long the shaving takes.
 */

export interface Row {
  x: number;
  w: number;
}

export interface Slice {
  x: number;
  y: number;
  w: number;
  vx: number;
  vy: number;
  life: number;
}

export type Drop = "none" | "placed" | "perfect" | "missed";

export interface Sim {
  /** Rows successfully placed, including the base. Drives the score. */
  placed: number;
  score: number;
  /** Unbroken perfects. Reset by any imperfect drop. */
  combo: number;
  /** The longest combo this run reached, for the death screen. */
  bestCombo: number;
  dead: boolean;

  /** The block currently sliding, in view coordinates. */
  curX: number;
  curW: number;
  /** Its previous x, for the renderer's interpolation. */
  prevX: number;
  dir: 1 | -1;
  speed: number;

  /** Most recent rows, oldest-to-newest order recovered via `rowAt`. */
  rows: Row[];
  slices: Slice[];

  /**
   * How high the view has climbed, in view pixels. Eased toward `camTarget`.
   *
   * Zero for the first several rows: the tower is anchored to the ground and
   * simply grows up the screen, and the camera only starts moving once the top
   * of it would pass the drop line. That is what makes the first drop land on
   * something visible instead of floating in the middle of an empty screen.
   */
  cam: number;
  camTarget: number;

  /** What the last step's drop did. One step only. */
  drop: Drop;
  /**
   * Of a `placed` drop, the fraction of the block that survived, 0..1. The
   * near-miss cue reads it: a block that kept a fifth of itself is a block
   * that was one frame from ending the run, and the run should sound like it.
   */
  kept: number;

  step(dt: number, dropPressed: boolean): void;
  /** Row `i` counting back from the newest, or null. 0 is the top of the tower. */
  rowAt(i: number): Row | null;
  /**
   * Screen y of the top edge of the row at height `r`, where 0 is the base.
   *
   * The one place the world-to-screen transform is written, so the renderer,
   * the falling slices and any future thing that needs to point at a row all
   * agree. Having it here rather than in the renderer is what lets the drop's
   * debris spawn at the height the block was actually cut at — the renderer
   * runs after the step and does not know where the block was.
   */
  rowY(r: number): number;
}

export function createSim(): Sim {
  const rows: Row[] = [];
  for (let i = 0; i < T.VISIBLE_ROWS; i++) rows.push({ x: 0, w: 0 });

  const slices: Slice[] = [];
  for (let i = 0; i < T.SLICES; i++) {
    slices.push({ x: 0, y: 0, w: 0, vx: 0, vy: 0, life: 0 });
  }
  let sliceNext = 0;

  const s: Sim = {
    placed: 1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    dead: false,
    curX: 0,
    curW: T.START_W,
    prevX: 0,
    dir: 1,
    speed: T.SLIDE_SPEED,
    rows,
    slices,
    cam: 0,
    camTarget: 0,
    drop: "none",
    kept: 1,
    step,
    rowAt,
    rowY,
  };

  // The base course, centred. It is `placed` 1 and is never dropped.
  const base = rows[0];
  base.x = (T.VIEW_W - T.START_W) / 2;
  base.w = T.START_W;

  s.curX = base.x;
  s.prevX = base.x;

  /** The newest row, which is what the next drop lands on. */
  function top(): Row {
    return rows[(s.placed - 1) % rows.length];
  }

  function rowAt(i: number): Row | null {
    // `i` counts backward from the newest: 0 is the top of the tower.
    const index = s.placed - 1 - i;
    if (index < 0 || i >= rows.length) return null;
    return rows[index % rows.length];
  }

  function rowY(r: number): number {
    // A row occupies `[rowY, rowY + ROW_H]`, so the base (r = 0) sits with its
    // BOTTOM on the floor — hence the +1. `cam` is added rather than
    // subtracted because climbing moves the world down the screen.
    return T.FLOOR_Y - (r + 1) * T.ROW_H + s.cam;
  }

  function spawnSlice(x: number, w: number, away: number) {
    const sl = slices[sliceNext];
    sliceNext = (sliceNext + 1) % slices.length;
    sl.x = x;
    sl.w = w;
    // At the height the block was actually cut, which is the active block's
    // row — one above the current top. Before the floor existed this was the
    // drop line unconditionally, which was right only because the tower's top
    // was pinned there.
    sl.y = rowY(s.placed);
    sl.vx = away * 60;
    sl.vy = -40;
    sl.life = 1.1;
  }

  function step(dt: number, dropPressed: boolean) {
    if (s.dead) return;
    s.drop = "none";

    // ── Slices, which keep falling after the run ends ───────────────────
    for (let i = 0; i < slices.length; i++) {
      const sl = slices[i];
      if (sl.life <= 0) continue;
      sl.life -= dt;
      sl.x += sl.vx * dt;
      sl.y += sl.vy * dt;
      sl.vy += 1400 * dt;
    }

    // ── Camera ──────────────────────────────────────────────────────────
    // Eased rather than snapped: a tower that jumps a row on every placement
    // makes the next block's position unreadable for the frame after a drop,
    // which is exactly the frame the player is lining up in.
    s.cam += (s.camTarget - s.cam) * Math.min(1, T.CAM_LERP * dt);

    // ── The drop is resolved BEFORE the slide moves ─────────────────────
    //
    // Not a detail, and getting it the other way round quietly breaks the
    // game's one interesting rule. A player presses against the block they
    // can see, which is where the last step left it. Advancing first and then
    // resolving lands the block up to `speed * dt` from where they aimed —
    // 8.7 px at the 520 px/s cap, against a 4 px perfect window. Perfects
    // would become unhittable exactly as the game got fast enough to need
    // them, and it would read as the window shrinking rather than as latency.
    if (!dropPressed) {
      s.prevX = s.curX;
      s.curX += s.speed * s.dir * dt;
      // Clamped rather than reflected around the overshoot: a block that
      // bounces past the edge and back reads as a physics bug in a game that
      // has no physics.
      if (s.curX + s.curW >= T.VIEW_W) {
        s.curX = T.VIEW_W - s.curW;
        s.dir = -1;
      } else if (s.curX <= 0) {
        s.curX = 0;
        s.dir = 1;
      }
      return;
    }

    const prev = top();
    const offset = s.curX - prev.x;

    if (Math.abs(offset) < T.PERFECT_WINDOW) {
      // Snapped, and paid. The bonus is smaller than the window, so a perfect
      // run widens slowly instead of becoming a plank.
      s.curX = prev.x;
      s.curW = Math.min(T.START_W, prev.w + T.WIDTH_BONUS);
      s.combo++;
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      s.drop = "perfect";
    } else {
      const left = Math.max(prev.x, s.curX);
      const right = Math.min(prev.x + prev.w, s.curX + s.curW);
      const overlap = right - left;

      if (overlap <= 0) {
        // Missed the tower entirely. The block falls, and so does the run.
        spawnSlice(s.curX, s.curW, offset > 0 ? 1 : -1);
        s.combo = 0;
        s.dead = true;
        s.drop = "missed";
        return;
      }

      // The overhang is cut off and thrown, on the side it actually hung over.
      if (offset > 0) spawnSlice(right, s.curX + s.curW - right, 1);
      else spawnSlice(s.curX, left - s.curX, -1);

      s.curX = left;
      s.kept = overlap / Math.max(1e-6, prev.w);
      s.curW = overlap;
      s.combo = 0;
      s.drop = "placed";
    }

    // ── Commit ──────────────────────────────────────────────────────────
    const row = rows[s.placed % rows.length];
    row.x = s.curX;
    row.w = s.curW;
    s.placed++;

    // Not `+= ROW_H`. The camera does not move at all until the tower is tall
    // enough to reach the drop line, and from then on it tracks the top of the
    // stack exactly — so the play line is at a constant screen height for the
    // whole run and the first rows are visibly standing on the ground.
    s.camTarget = Math.max(0, T.ROW_H * s.placed - T.CLIMB);
    s.speed = Math.min(T.SLIDE_CAP, s.speed + T.SLIDE_INC);
    s.score += T.ROW_POINTS + s.combo * T.COMBO_POINTS;

    // The next block enters from the side the last one was not on, so the
    // rhythm alternates instead of the player waiting out a full sweep.
    s.dir = s.curX < T.VIEW_W / 2 ? 1 : -1;
    s.curX = s.dir === 1 ? 0 : T.VIEW_W - s.curW;
  }

  return s;
}
