/**
 * The fixed-timestep loop every arcade game runs on.
 *
 * ── Why fixed, and why it is not negotiable ──────────────────────────────
 *
 * A game that integrates the real frame delta plays differently on every
 * panel: jump heights, gap spacing and difficulty all become functions of the
 * player's refresh rate. Stepping a constant 1/60 and interpolating the draw
 * makes the simulation identical everywhere and the motion smooth anyway.
 * `loop.test.ts` asserts exactly that — the same number of steps per second of
 * wall time at 60, 90, 144 and 240Hz.
 *
 * ── The two clamps, and what each is for ─────────────────────────────────
 *
 * `MAX_FRAME` clamps one frame's contribution: a tab that was in the
 * background for a minute hands back a 60-second delta, and without this the
 * accumulator would ask for 3,600 steps and the browser would hang before the
 * player saw anything. `MAX_STEPS` clamps the catch-up: on a machine that
 * cannot keep up, running more steps than frames makes it slower still, which
 * is the spiral of death. Dropping the remainder is the right trade — a
 * dropped step is a hitch, a spiral is a hang.
 */
const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
  raf: {
    request: (cb: (t: number) => void) => number;
    cancel: (h: number) => void;
    now: () => number;
  } = {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
    now: () => performance.now(),
  }
): Loop {
  let handle = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  const frame = (now: number) => {
    handle = raf.request(frame);
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    acc += elapsed;

    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      step(FIXED_DT);
      acc -= FIXED_DT;
      steps++;
    }
    // Hit the cap: the machine is behind and the leftover time is time it will
    // never make up. Kept, it would ask for the same overrun again next frame.
    if (steps === MAX_STEPS) acc = 0;

    render(acc / FIXED_DT);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = raf.now();
      acc = 0;
      handle = raf.request(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      raf.cancel(handle);
    },
    get running() {
      return running;
    },
  };
}

export { FIXED_DT, MAX_FRAME, MAX_STEPS };
