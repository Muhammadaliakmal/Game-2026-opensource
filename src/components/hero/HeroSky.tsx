/**
 * The sky behind the landing island: a gradient, a star field the night
 * shows, and blocky clouds drifting across. Pure CSS (`.hero-sky` in
 * globals.css, colours in tokens.css), and a Server Component, so the same
 * sky paints in the loading placeholder before three.js has arrived and the
 * canvas only ever draws the island over it.
 *
 * Each cloud is placed by hand rather than at random: this renders on the
 * server, and a random sky would hydrate as a mismatch. The negative delays
 * start them already spread across the sky instead of queued at the left
 * edge, and `--rest` is where each one parks under reduced motion.
 */

type Cloud = {
  /** Height in the sky, as a percentage of the hero. */
  top: number;
  /** One cloud block, in px. Smaller reads as further away. */
  u: number;
  /** Seconds to cross. Further clouds are slower — parallax by speed. */
  drift: number;
  /** Negative: how far through its crossing it starts. */
  delay: number;
  rest: number;
  opacity: number;
};

const CLOUDS: Cloud[] = [
  { top: 8, u: 16, drift: 95, delay: -20, rest: 6, opacity: 1 },
  { top: 22, u: 10, drift: 150, delay: -95, rest: 62, opacity: 0.85 },
  { top: 4, u: 8, drift: 190, delay: -140, rest: 40, opacity: 0.7 },
  { top: 34, u: 13, drift: 120, delay: -60, rest: 80, opacity: 0.9 },
  { top: 15, u: 7, drift: 220, delay: -30, rest: 24, opacity: 0.6 },
  { top: 44, u: 9, drift: 170, delay: -150, rest: 48, opacity: 0.55 },
];

export function HeroSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="hero-sky__stars" />
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className="hero-cloud"
          style={
            {
              top: `${c.top}%`,
              opacity: c.opacity,
              "--u": `${c.u}px`,
              "--drift": `${c.drift}s`,
              "--delay": `${c.delay}s`,
              "--rest": `${c.rest}vw`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
