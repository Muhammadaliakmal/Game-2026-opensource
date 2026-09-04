/**
 * The cover art for a mode, drawn rather than photographed.
 *
 * ── Why SVG and not a screenshot ─────────────────────────────────────────
 *
 * A screenshot is the obvious answer and it is the wrong one here. It would be
 * a PNG per mode plus one per course — seven files that have to be re-captured
 * every time a course is edited or the sky is retuned, and that are silently
 * wrong the rest of the time. Worse, it would be a real download on the first
 * screen anybody sees, for art that is three shapes and a gradient.
 *
 * This is built from the same numbers the game's own sky is: the ramp below is
 * `NIGHT_STOPS`, the moon sits where `MOON_AZIMUTH_DEG` puts it, and the
 * accent comes from `--color-accent`, which `data-mode` has already rebound to
 * the mode's own colour. So the card cannot drift out of step with the thing
 * it is advertising — it is generated from it.
 *
 * ── What each cover is of ────────────────────────────────────────────────
 *
 * Not a logo. A cover has to say what the mode *is* in the second before
 * anyone reads a word, so each one is a recognisable silhouette of the thing
 * you actually do: platforms climbing away from you, or a track bending away
 * under a bike. Both under the same night sky, because that is what you get
 * when you press it.
 */

// From lib/sky-stops rather than lib/atmosphere: this renders on the
// server, and atmosphere.ts imports the whole of three.js.
import { NIGHT_STOPS } from "@/lib/sky-stops";

export type ModeArt = "parkour" | "race";

/** Deterministic, so the art is identical on the server and in the browser. */
function stars(count: number, seed: number) {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  // A tiny LCG rather than Math.random: this renders on the server first, and
  // a different sky on each render would hydrate as a mismatch.
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const t = next();
    out.push({
      x: next() * 400,
      // Squared, so stars gather toward the top of the frame and thin out
      // where the ground is about to be — the same horizon fade the real sky
      // applies, for the same reason.
      y: next() * next() * 150,
      r: 0.4 + t * t * 1.5,
      o: 0.35 + next() * 0.65,
    });
  }
  return out;
}

const PARKOUR_STARS = stars(70, 20240115);
const RACE_STARS = stars(70, 77010203);

/**
 * The sky, shared by both covers.
 *
 * Four of the five night stops. The fifth is the fog band a metre off the
 * horizon, which matters in a 3D scene and is invisible in a 400x225 poster.
 */
function NightBackdrop({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={NIGHT_STOPS[0].hex} />
          <stop offset="0.3" stopColor={NIGHT_STOPS[2].hex} />
          <stop offset="0.65" stopColor={NIGHT_STOPS[3].hex} />
          <stop offset="1" stopColor={NIGHT_STOPS[4].hex} />
        </linearGradient>
        <radialGradient id={`${id}-moon`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#c9d8ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7e93d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-glow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="225" fill={`url(#${id}-sky)`} />
    </>
  );
}

function Moon({ id, cx, cy }: { id: string; cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="34" fill={`url(#${id}-moon)`} />
      <circle cx={cx} cy={cy} r="11" fill="#eef2ff" />
      {/* Two maria, so it is a moon and not a dot. */}
      <circle cx={cx - 3.4} cy={cy - 2.6} r="3.2" fill="#c4cee8" opacity="0.6" />
      <circle cx={cx + 3.6} cy={cy + 3.2} r="2.2" fill="#c4cee8" opacity="0.45" />
    </>
  );
}

function Stars({ from }: { from: typeof PARKOUR_STARS }) {
  return (
    <g fill="#ffffff">
      {from.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
      ))}
    </g>
  );
}

/**
 * Parkour: platforms climbing away from the viewer.
 *
 * Rise one, gap two — the same jump the tutorial teaches, which is the shape a
 * player will recognise the moment they are standing on it.
 */
function ParkourArt() {
  const pads = [
    { x: 26, y: 176, w: 74, h: 11 },
    { x: 116, y: 158, w: 58, h: 10 },
    { x: 188, y: 140, w: 52, h: 9 },
    { x: 254, y: 122, w: 46, h: 9 },
    { x: 314, y: 104, w: 60, h: 8 },
  ];
  return (
    <>
      <Stars from={PARKOUR_STARS} />
      <Moon id="pk" cx={330} cy={46} />

      {/* The void under the course: what makes a gap a gap. */}
      <rect y="150" width="400" height="75" fill="#02030a" opacity="0.55" />

      {pads.map((p, i) => (
        <g key={i}>
          {/* Face, then a lit top edge — the read that says "you land here". */}
          <rect
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx="1.5"
            fill="#1b2450"
          />
          <rect
            x={p.x}
            y={p.y - 2.5}
            width={p.w}
            height="3"
            rx="1.5"
            fill="var(--color-accent)"
            opacity={0.55 + i * 0.1}
          />
          <rect
            x={p.x}
            y={p.y + 1}
            width={p.w}
            height="14"
            fill={`url(#pk-glow)`}
            opacity="0.25"
          />
        </g>
      ))}

      {/* The runner, mid-jump between the third pad and the fourth — the one
          instant that is worth drawing. */}
      <g transform="translate(246 108)">
        <rect x="-3.2" y="-14" width="6.4" height="9" rx="2" fill="#eef1ff" />
        <circle cx="0" cy="-18" r="3.4" fill="#eef1ff" />
        <rect
          x="-4.5"
          y="-5"
          width="3.6"
          height="8"
          rx="1.6"
          fill="#eef1ff"
          transform="rotate(-22)"
        />
        <rect x="1.4" y="-5" width="3.6" height="8" rx="1.6" fill="#eef1ff" />
      </g>
    </>
  );
}

/**
 * Race: a track bending away, with a bike on it.
 *
 * Drawn in perspective rather than flat, because the one thing a racing cover
 * has to communicate is speed, and speed is the road narrowing.
 */
function RaceArt() {
  return (
    <>
      <Stars from={RACE_STARS} />
      <Moon id="rc" cx={68} cy={42} />

      {/* Ground plane, darker than the sky so the horizon reads. */}
      <rect y="126" width="400" height="99" fill="#070b1c" />
      <rect y="124" width="400" height="2.5" fill="#1b2450" />

      {/* The road: wide at the bottom, pinched at the horizon, bending right. */}
      <path
        d="M96 225 L176 128 L232 128 L344 225 Z"
        fill="#12172e"
      />
      {/* Kerbs. The accent is the whole point of the frame, so it is on the
          two edges that define the road and nowhere else. */}
      <path
        d="M96 225 L176 128 L182 128 L112 225 Z"
        fill="var(--color-accent)"
        opacity="0.85"
      />
      <path
        d="M344 225 L232 128 L226 128 L328 225 Z"
        fill="var(--color-accent)"
        opacity="0.85"
      />

      {/* Centre dashes, shortening with distance. */}
      <g fill="#5b6796" opacity="0.75">
        <rect x="216" y="213" width="7" height="12" rx="1" />
        <rect x="214" y="192" width="6" height="9" rx="1" />
        <rect x="211" y="175" width="5" height="7" rx="1" />
        <rect x="209" y="162" width="4" height="5" rx="1" />
        <rect x="207" y="152" width="3.4" height="4" rx="1" />
      </g>

      {/* The bike, and the trail that says it is moving. */}
      <g transform="translate(206 186)">
        <path
          d="M0 6 C -14 4, -30 -2, -46 -12"
          stroke="var(--color-accent)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.28"
        />
        <ellipse cx="0" cy="15" rx="17" ry="4" fill="#02030a" opacity="0.5" />
        <circle cx="-9" cy="10" r="6.5" fill="#0d1124" stroke="#39406b" strokeWidth="2" />
        <circle cx="11" cy="10" r="6.5" fill="#0d1124" stroke="#39406b" strokeWidth="2" />
        <path
          d="M-9 10 L-1 -2 L11 -1 L13 9 Z"
          fill="var(--color-accent)"
        />
        <rect x="-6" y="-11" width="9" height="10" rx="3" fill="#eef1ff" />
        <circle cx="-1.5" cy="-15" r="3.6" fill="#eef1ff" />
        {/* Headlight, aimed down the road. */}
        <circle cx="14" cy="2" r="2.6" fill="#ffffff" opacity="0.9" />
      </g>
    </>
  );
}

/**
 * @param art which mode's picture.
 *
 * `aria-hidden` throughout: the card around this carries the name and the
 * description, and a screen reader announcing "night sky with platforms" adds
 * nothing a player can act on.
 */
export function ModeCover({ art }: { art: ModeArt }) {
  return (
    <svg
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <NightBackdrop id={art === "race" ? "rc" : "pk"} />
      {art === "race" ? <RaceArt /> : <ParkourArt />}
    </svg>
  );
}
