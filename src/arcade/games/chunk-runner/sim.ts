import * as T from "./tuning";

/**
 * Chunk Runner's simulation: everything that moves, and nothing that draws.
 *
 * ── Why this is a separate file from `render.ts` ─────────────────────────
 *
 * Because it can be tested. Coyote time, jump buffering and the ring buffer
 * are the parts most likely to be subtly wrong and least likely to be noticed
 * — a jump that eats one input in twenty reads as "the game is unresponsive
 * sometimes", which is unfixable as a bug report. Split out, they are
 * assertions in `sim.test.ts` instead of something somebody has to feel.
 *
 * ── Zero allocation after `createSim` ────────────────────────────────────
 *
 * Every object this game will ever have is made once, up front. Platforms,
 * coins and spikes are fixed-size arrays whose members are *repositioned* when
 * they leave the screen rather than replaced. Nothing in `step` allocates, so
 * a run never hands the collector a reason to pause during a jump.
 *
 * ── Screen coordinates, so y grows downward ──────────────────────────────
 *
 * The spec's numbers are written that way — gravity 1800, jump impulse -620 —
 * and converting them would mean every tuning value disagreeing with the
 * document it came from.
 */

export interface Chunk {
  x: number;
  w: number;
  /** Height of the surface above the baseline. */
  h: number;
}

export interface Coin {
  x: number;
  y: number;
  live: boolean;
}

export interface Spike {
  x: number;
  /** Surface height of the platform it stands on. */
  h: number;
  live: boolean;
}

export interface SimInput {
  /** True on the step the jump was newly pressed. */
  jumpPressed: boolean;
  /** True while it is held. */
  jumpHeld: boolean;
}

export type Death = "gap" | "wall" | "spike" | null;

export interface Sim {
  /** Seconds survived. */
  t: number;
  /** Pixels of ground covered. */
  dist: number;
  score: number;
  coins: number;
  /** Coins taken without touching the ground. Drives the rising pitch. */
  streak: number;
  speed: number;

  /** Player box, in world pixels. `py` is its top edge. */
  px: number;
  py: number;
  vy: number;
  onGround: boolean;
  /** Where it was last step, for the renderer's interpolation. */
  prevX: number;
  prevY: number;

  chunks: Chunk[];
  coinPool: Coin[];
  spikePool: Spike[];

  dead: Death;
  /** Set for exactly one step when a coin is taken, for the sound. */
  tookCoin: boolean;
  /** Set for exactly one step on landing, for the dust. */
  landed: boolean;

  /** World x at the left edge of the canvas. */
  camX: number;

  step(dt: number, input: SimInput): void;
  /**
   * A watched ad's second chance: the runner is set down on the nearest
   * platform at or ahead of where it died, with the spikes there cleared, and
   * the run carries on at the same distance, score and speed.
   */
  revive(): void;
}

/** Canvas y of a platform surface `h` above the baseline. */
export const surfaceY = (height: number, h: number) => height - T.GROUND_Y - h;

export function createSim(rng: () => number, width: number, height: number): Sim {
  const chunks: Chunk[] = [];
  const coinPool: Coin[] = [];
  const spikePool: Spike[] = [];

  for (let i = 0; i < T.CHUNKS; i++) chunks.push({ x: 0, w: 0, h: 0 });
  for (let i = 0; i < T.COINS; i++) coinPool.push({ x: 0, y: 0, live: false });
  for (let i = 0; i < T.SPIKES; i++) spikePool.push({ x: 0, h: 0, live: false });

  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

  /**
   * The right edge of the furthest platform placed so far.
   *
   * Tracked rather than searched for. A scan over the array would be a closure
   * allocated inside `step` every time a platform recycles, which is exactly
   * the allocation this file promises not to make.
   */
  let frontier = 0;
  let lastHeight = 0;
  let coinNext = 0;
  let spikeNext = 0;

  const s: Sim = {
    t: 0,
    dist: 0,
    score: 0,
    coins: 0,
    streak: 0,
    speed: T.BASE_SPEED,
    px: 0,
    py: 0,
    vy: 0,
    onGround: true,
    prevX: 0,
    prevY: 0,
    chunks,
    coinPool,
    spikePool,
    dead: null,
    tookCoin: false,
    landed: false,
    camX: 0,
    step,
    revive,
  };

  function decorate(c: Chunk) {
    // Spikes only once the run has had time to teach the jump. A hazard in the
    // first seconds of a one-input game is a tutorial that kills you.
    if (s.t > T.SPIKE_GRACE && rng() < T.SPIKE_CHANCE && c.w > T.CHUNK_MIN_W) {
      const sp = spikePool[spikeNext];
      spikeNext = (spikeNext + 1) % spikePool.length;
      // Never near the leading edge: a spike you cannot see until you are
      // committed to the jump is not a hazard, it is a coin flip.
      sp.x = c.x + c.w * 0.55 + rng() * (c.w * 0.3);
      sp.h = c.h;
      sp.live = true;
    }

    if (rng() < T.COIN_CHANCE) {
      const n = 2 + Math.floor(rng() * 3);
      // A jump's worth above the surface, so a line of gold is a reason to
      // leave the ground rather than something collected by running.
      const y = surfaceY(height, c.h) - 44 - rng() * 40;
      for (let i = 0; i < n; i++) {
        const coin = coinPool[coinNext];
        coinNext = (coinNext + 1) % coinPool.length;
        coin.x = c.x + c.w * 0.2 + i * 34;
        coin.y = y;
        coin.live = true;
      }
    }
  }

  /**
   * Put a platform down past everything else.
   *
   * Generating the first platforms and recycling one that has scrolled off are
   * the same operation, which is the whole point of a ring buffer: there is no
   * separate "spawn" path that could drift from the "generate" one.
   */
  function placeChunk(c: Chunk, first: boolean) {
    if (first) {
      // The run starts on solid ground under the player's feet, wide enough to
      // land on and with nothing on it.
      c.x = 0;
      c.w = width;
      c.h = 0;
      lastHeight = 0;
      frontier = c.w;
      return;
    }

    // Gaps scale with speed. Section 4.1 is explicit that difficulty comes
    // from spacing, not just from the ramp: 260 px is a fair jump at 300 px/s
    // and a free one at 780.
    const scale = s.speed / T.BASE_SPEED;
    c.x = frontier + between(T.GAP_MIN, T.GAP_MAX) * scale;
    c.w = between(T.CHUNK_MIN_W, T.CHUNK_MAX_W);
    c.h = Math.max(
      T.HEIGHT_MIN,
      Math.min(T.HEIGHT_MAX, lastHeight + between(-T.STEP_MAX, T.STEP_MAX))
    );

    lastHeight = c.h;
    frontier = c.x + c.w;
    decorate(c);
  }

  placeChunk(chunks[0], true);
  for (let i = 1; i < chunks.length; i++) placeChunk(chunks[i], false);

  s.px = width * T.PLAYER_ANCHOR;
  s.py = surfaceY(height, 0) - T.PLAYER_H;
  s.prevX = s.px;
  s.prevY = s.py;

  /** Coyote and buffer timers, in seconds. Counted down, never allocated. */
  let coyote = T.COYOTE;
  let buffered = 0;
  let jumping = false;

  function revive() {
    if (!s.dead) return;
    // The nearest platform still under or ahead of the runner with a real
    // runway left on it — about half a second of running at the current speed —
    // so the continue does not set them down on the lip of the gap that
    // killed them. Behind is no good: the camera has already left it.
    const runway = Math.max(160, s.speed * 0.45);
    let best: Chunk | null = null;
    for (const c of chunks) {
      if (c.w <= 0 || c.x + c.w < s.px + T.PLAYER_W + runway) continue;
      if (!best || c.x < best.x) best = c;
    }
    if (best) {
      if (best.x > s.px) s.px = best.x + 12;
      s.py = surfaceY(height, best.h) - T.PLAYER_H - 40;
    }
    for (const sp of spikePool) {
      if (sp.live && sp.x > s.px - 60 && sp.x < s.px + 420) sp.live = false;
    }
    s.vy = 0;
    s.onGround = false;
    s.dead = null;
    s.streak = 0;
    s.prevX = s.px;
    s.prevY = s.py;
    s.camX = s.px - width * T.PLAYER_ANCHOR;
    coyote = 0;
    buffered = 0;
    jumping = false;
  }

  function step(dt: number, input: SimInput) {
    if (s.dead) return;

    s.prevX = s.px;
    s.prevY = s.py;
    s.tookCoin = false;
    s.landed = false;

    s.t += dt;
    s.speed =
      T.BASE_SPEED + Math.min(s.t * T.SPEED_RAMP, T.SPEED_CAP - T.BASE_SPEED);

    // ── The two forgiveness timers ──────────────────────────────────────
    coyote = s.onGround ? T.COYOTE : Math.max(0, coyote - dt);
    buffered = input.jumpPressed ? T.JUMP_BUFFER : Math.max(0, buffered - dt);

    if (buffered > 0 && coyote > 0) {
      s.vy = T.JUMP_V;
      s.onGround = false;
      jumping = true;
      // Both are spent. Leaving either set is how one press becomes two jumps
      // — the buffer would still be warm on the next step, and the player
      // would launch again the instant they landed.
      buffered = 0;
      coyote = 0;
    }

    // Releasing early cuts the rise, which is what makes a short hop short.
    if (jumping && !input.jumpHeld && s.vy < 0) {
      s.vy *= T.JUMP_CUT;
      jumping = false;
    }

    // Glide only after the apex. Applied to the rise it would just be a
    // bigger jump, and the tuning table would stop meaning anything.
    const gliding = input.jumpHeld && s.vy > T.GLIDE_MIN_VY;
    s.vy += T.GRAVITY * (gliding ? T.GLIDE_GRAVITY : 1) * dt;

    // ── X first, then Y ─────────────────────────────────────────────────
    // Not arbitrary: resolving both against a stack of boxes at once is how a
    // runner snags on the corner of a platform it was clearly going to land
    // on, which reads as the game cheating.
    const nx = s.px + s.speed * dt;
    const feet = s.py + T.PLAYER_H;

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (nx + T.PLAYER_W < c.x || nx > c.x + c.w) continue;
      const sy = surfaceY(height, c.h);
      // The player's feet are below this surface and they were still behind
      // its leading edge: they have run into the side of a step.
      if (feet > sy + 1 && s.px + T.PLAYER_W <= c.x + 1) {
        s.dead = "wall";
        return;
      }
    }

    s.dist += nx - s.px;
    s.px = nx;

    const ny = s.py + s.vy * dt;
    const wasOnGround = s.onGround;
    s.onGround = false;

    if (s.vy >= 0) {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (s.px + T.PLAYER_W < c.x || s.px > c.x + c.w) continue;
        const sy = surfaceY(height, c.h);
        // Crossed the surface from above during this step. Tested as a
        // crossing rather than an overlap so a fast fall cannot tunnel
        // through a platform between two frames.
        if (s.py + T.PLAYER_H <= sy + 0.5 && ny + T.PLAYER_H >= sy) {
          s.py = sy - T.PLAYER_H;
          s.vy = 0;
          s.onGround = true;
          jumping = false;
          s.landed = !wasOnGround;
          // Landing ends a streak: a chain of gold is a chain taken in one
          // flight, which is what makes the rising pitch mean anything.
          s.streak = 0;
          break;
        }
      }
    }

    if (!s.onGround) s.py = ny;

    if (s.py > height + 120) {
      s.dead = "gap";
      return;
    }

    s.camX = s.px - width * T.PLAYER_ANCHOR;

    for (let i = 0; i < spikePool.length; i++) {
      const sp = spikePool[i];
      if (!sp.live) continue;
      if (sp.x + T.SPIKE_W < s.camX - 200) {
        sp.live = false;
        continue;
      }
      const sy = surfaceY(height, sp.h);
      if (
        s.px + T.PLAYER_W > sp.x &&
        s.px < sp.x + T.SPIKE_W &&
        s.py + T.PLAYER_H > sy - T.SPIKE_H &&
        s.py < sy
      ) {
        s.dead = "spike";
        return;
      }
    }

    for (let i = 0; i < coinPool.length; i++) {
      const coin = coinPool[i];
      if (!coin.live) continue;
      if (coin.x + T.COIN_R < s.camX - 200) {
        coin.live = false;
        continue;
      }
      if (
        s.px + T.PLAYER_W > coin.x - T.COIN_R &&
        s.px < coin.x + T.COIN_R &&
        s.py + T.PLAYER_H > coin.y - T.COIN_R &&
        s.py < coin.y + T.COIN_R
      ) {
        coin.live = false;
        s.coins++;
        s.streak++;
        s.tookCoin = true;
      }
    }

    // ── Recycle ─────────────────────────────────────────────────────────
    // A platform entirely behind the camera is repositioned ahead of the
    // frontier. The array never changes length and no chunk is created after
    // `createSim` returned.
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.x + c.w < s.camX - 200) placeChunk(c, false);
    }

    s.score = Math.floor(s.dist / T.PIXELS_PER_POINT) + s.coins * T.COIN_POINTS;
  }

  return s;
}
