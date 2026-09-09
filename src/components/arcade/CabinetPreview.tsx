"use client";

/**
 * The picture on a cabinet card.
 *
 * ── Why this is generated and not a screenshot ───────────────────────────
 *
 * The panel above each cabinet's title was empty — 150px of flat blue holding
 * a payout label and nothing else. Two blank rectangles is what a first-time
 * visitor to the arcade sees, and an arcade whose shelf is empty is a shop
 * that looks closed.
 *
 * The obvious fix is a captured frame per game, and it is the wrong one for
 * the same reason the mode covers are SVG rather than screenshots (CLAUDE.md,
 * "The menu"): a PNG per cabinet is a file to re-capture every time a game's
 * art changes, and silently stale the rest of the time. A looping video is
 * worse again — two decoders running on a page whose whole job is to be a list.
 *
 * So each cabinet draws its own mechanic in SVG, from the same numbers the
 * game is built from. Tower Stack shows a stack of narrowing rows on a ground
 * line; Chunk Runner shows a run of chunks with a gap and an arc over it.
 * Neither is a screenshot and neither pretends to be — they are diagrams of
 * the verb, which is the thing a player is actually choosing between.
 *
 * ── Why it takes the accent from CSS ─────────────────────────────────────
 *
 * `currentColor` and `var(--color-accent)`, so a cabinet card inside a
 * `data-mode` subtree recolours with everything else and no prop is threaded
 * for it. Same mechanism as the mode covers.
 */

/** The shapes, keyed by cabinet id. Unknown ids get the neutral grid. */
export function CabinetPreview({ id }: { id: string }) {
  if (id === "tower-stack") return <TowerArt />;
  if (id === "chunk-runner") return <RunnerArt />;
  return <GridArt />;
}

/** One shared frame, so every cabinet's art sits on the same ground. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 240 96"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        {/* The same top-down darkening the mode covers use, so the payout chip
            along the bottom edge always has a ground to sit on regardless of
            what the art is doing behind it. */}
        <linearGradient id="cab-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1030" stopOpacity="0" />
          <stop offset="100%" stopColor="#0b1030" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {children}
      <rect width="240" height="96" fill="url(#cab-scrim)" />
    </svg>
  );
}

/**
 * Tower Stack: rows narrowing as they climb, standing on a ground line.
 *
 * The narrowing is the mechanic — every imperfect drop shaves the block — and
 * the ground line is the thing the game itself was missing until this pass
 * (bug #13). The card and the game now agree about which way a tower goes.
 */
function TowerArt() {
  const rows = [
    { w: 92, y: 74 },
    { w: 84, y: 62 },
    { w: 78, y: 50 },
    { w: 66, y: 38 },
    { w: 58, y: 26 },
  ];
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      {rows.map((r, i) => (
        <rect
          key={r.y}
          x={120 - r.w / 2}
          y={r.y}
          width={r.w}
          height="10"
          rx="1"
          fill={`hsl(${190 + i * 14} 70% 58%)`}
        />
      ))}
      {/* The block still sliding, offset — which is the moment the game is. */}
      <rect
        x={120 - 58 / 2 + 26}
        y="12"
        width="58"
        height="10"
        rx="1"
        fill="hsl(260 70% 62%)"
        opacity="0.9"
      />
      <rect x="0" y="86" width="240" height="10" fill="#141a3d" />
      <rect x="0" y="86" width="240" height="1.5" fill="#2b3570" />
    </Frame>
  );
}

/**
 * Chunk Runner: platforms, a gap, and the arc that clears it.
 *
 * The arc is the whole game in one line — a runner is a series of decisions
 * about one jump — and it is drawn rather than implied because a row of blocks
 * on its own is indistinguishable from the tower next to it.
 */
function RunnerArt() {
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      {[
        { x: 0, w: 74 },
        { x: 104, w: 60 },
        { x: 190, w: 50 },
      ].map((p) => (
        <g key={p.x}>
          <rect x={p.x} y="62" width={p.w} height="34" fill="#1b2452" />
          <rect
            x={p.x}
            y="62"
            width={p.w}
            height="4"
            fill="var(--color-accent, #00fff5)"
            opacity="0.75"
          />
        </g>
      ))}
      {/* The jump. Dashed, because it is a path rather than a thing. */}
      <path
        d="M60 58 Q 89 20 118 58"
        fill="none"
        stroke="var(--color-accent, #00fff5)"
        strokeWidth="2"
        strokeDasharray="5 4"
        opacity="0.8"
      />
      <rect x="52" y="48" width="10" height="14" rx="1" fill="#e2e8f0" />
    </Frame>
  );
}

/** For a cabinet with no art of its own yet. Still never empty. */
function GridArt() {
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={i * 24}
          y="0"
          width="1"
          height="96"
          fill="#1b2452"
        />
      ))}
    </Frame>
  );
}
