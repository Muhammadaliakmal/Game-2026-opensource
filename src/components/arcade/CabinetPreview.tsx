"use client";

import { SEAT_COLOURS } from "@/arcade/host/board";
import { LOOP_CELLS, rotatePoint, BOARD_SIZE as LUDO_SIZE } from "@/arcade/games/ludo/board";
import { LADDERS, SNAKES, gridOf } from "@/arcade/games/snakes/board";

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
 * ── The two board games are drawn from their own boards ──────────────────
 *
 * Ludo and Snakes & Ladders shipped on `GridArt`, the neutral placeholder —
 * ten vertical lines, which on the front page read as two cards that had
 * failed to load rather than as two games. They are also the two cabinets that
 * need the least invention, because **a board game seen from above is what the
 * game actually looks like.** There is no angle to choose and no moment to
 * pick: the board IS the picture.
 *
 * So both import their real geometry. Snakes takes `gridOf` — the boustrophedon
 * fold, square 1 bottom-left and the rows alternating — plus the nine ladders
 * and ten snakes exactly as the game plays them; every ladder on the card is a
 * ladder you can climb, and 87 really does drop you to 24. Ludo takes
 * `LOOP_CELLS` and `rotatePoint`, the same quarter-turn the board itself is
 * built from, so the cross on the card cannot be a quarter turn out from the
 * cross in the game. Both boards are in board units and scaled here, so no
 * coordinate is retyped.
 *
 * `SEAT_COLOURS` is shared with the painter for the same reason: a red seat on
 * the card and a red seat in the game are the same red because they are the
 * same constant.
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
  if (id === "ludo") return <LudoArt />;
  if (id === "snakes") return <SnakesArt />;
  if (id === "echo") return <EchoArt />;
  if (id === "gravity") return <GravityArt />;
  if (id === "bullet") return <BulletArt />;
  if (id === "swarm") return <SwarmArt />;
  if (id === "reflex") return <ReflexArt />;
  if (id === "duel") return <DuelArt />;
  return <GridArt />;
}

/**
 * One shared frame, so every cabinet's art sits on the same ground.
 *
 * 240×96 with `slice`, and the board games rely on what that crops to. The
 * cards are 5:3 on the front page and 5:2 in the lobby; `slice` scales to
 * cover, so the narrower card keeps about 160 units of width, centred. A board
 * 88 units wide about x=120 therefore survives both, which is why the two
 * square boards below are drawn at that size rather than to the full width.
 */
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

/** Where a square board sits in the frame, in viewBox units. */
const BOARD = { x: 76, y: 4, size: 88 } as const;

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
      {/* The offcut the last drop shaved, still falling. It is the difference
          between a stack of rectangles and a game about precision. */}
      <rect x={120 + 58 / 2} y="34" width="8" height="10" rx="1" fill="hsl(260 60% 46%)" opacity="0.7" />
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
      {/* Two rows of far chunks, dimmer and smaller. Depth is what stops the
          card reading as a diagram of three rectangles. */}
      {[
        { x: 16, w: 52, y: 44 },
        { x: 96, w: 44, y: 44 },
        { x: 168, w: 56, y: 44 },
      ].map((p) => (
        <rect key={`far${p.x}`} x={p.x} y={p.y} width={p.w} height="8" fill="#141c40" />
      ))}
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
      {/* The runner at the top of its arc rather than on the lip of the gap:
          mid-air is the only position that says the gap is survivable. */}
      <rect x="84" y="26" width="10" height="14" rx="1" fill="#e2e8f0" />
      <rect x="84" y="26" width="10" height="4" rx="1" fill="var(--color-accent, #00fff5)" />
    </Frame>
  );
}

/**
 * Ludo, from above, which is the only way Ludo is ever seen.
 *
 * Four yards at the corners, the cross of track between them, four home lanes
 * running in. `LOOP_CELLS` is the game's own 52-cell ring and `rotatePoint`
 * its own quarter turn, so the yards, the lanes and the track cannot disagree
 * about which corner belongs to which seat — the bug a hand-drawn board would
 * have, and the one nobody would notice until they played a red token into a
 * green lane.
 */
function LudoArt() {
  const u = BOARD.size / LUDO_SIZE;
  const px = (n: number) => BOARD.x + n * u;
  const py = (n: number) => BOARD.y + n * u;

  // Seat 0's yard is the 6×6 block at the origin; the other three are that
  // block's centre carried round by the board's own rotation.
  const yards = [{ x: 3, y: 3 }];
  for (let i = 0; i < 3; i++) yards.push(rotatePoint(yards[yards.length - 1]));

  // Seat 0's lane runs along row 7 from column 1 inward, exactly as board.ts
  // builds it. Each seat's is the previous one rotated.
  let lane = Array.from({ length: 5 }, (_, i) => ({ x: 1 + i + 0.5, y: 7.5 }));
  const lanes: Array<Array<{ x: number; y: number }>> = [];
  for (let seat = 0; seat < 4; seat++) {
    lanes.push(lane);
    lane = lane.map(rotatePoint);
  }

  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      {/* The table the board is lying on. */}
      <rect x={px(0)} y={py(0)} width={u * 15} height={u * 15} rx="2" fill="#f4f1e8" />

      {yards.map((c, seat) => (
        <g key={seat}>
          <rect
            x={px(c.x - 3)}
            y={py(c.y - 3)}
            width={u * 6}
            height={u * 6}
            fill={SEAT_COLOURS[seat]}
          />
          <rect
            x={px(c.x - 2)}
            y={py(c.y - 2)}
            width={u * 4}
            height={u * 4}
            rx="1"
            fill="#f4f1e8"
          />
          {/* Four waiting tokens, which is where every game starts. */}
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([dx, dy]) => (
            <circle
              key={`${dx},${dy}`}
              cx={px(c.x + dx)}
              cy={py(c.y + dy)}
              r={u * 0.38}
              fill={SEAT_COLOURS[seat]}
            />
          ))}
        </g>
      ))}

      {/* The ring. Drawn from the game's own cell list, not from four arms. */}
      {LOOP_CELLS.map(([col, row]) => (
        <rect
          key={`${col},${row}`}
          x={px(col)}
          y={py(row)}
          width={u}
          height={u}
          fill="#ffffff"
          stroke="#c8c2b0"
          strokeWidth="0.4"
        />
      ))}

      {lanes.map((cells, seat) =>
        cells.map((c) => (
          <rect
            key={`${seat}-${c.x},${c.y}`}
            x={px(c.x - 0.5)}
            y={py(c.y - 0.5)}
            width={u}
            height={u}
            fill={SEAT_COLOURS[seat]}
            stroke="#c8c2b0"
            strokeWidth="0.4"
          />
        ))
      )}

      {/* Home: the 3×3 at the centre, as four triangles meeting in the middle.
          Same winding as the yards, so a seat's colour points at its own lane. */}
      <g>
        {[
          `${px(6)},${py(6)} ${px(9)},${py(6)} ${px(7.5)},${py(7.5)}`,
          `${px(9)},${py(6)} ${px(9)},${py(9)} ${px(7.5)},${py(7.5)}`,
          `${px(9)},${py(9)} ${px(6)},${py(9)} ${px(7.5)},${py(7.5)}`,
          `${px(6)},${py(9)} ${px(6)},${py(6)} ${px(7.5)},${py(7.5)}`,
        ].map((pts, i) => (
          <polygon
            key={pts}
            points={pts}
            // The triangle a seat is aiming at is the one on the far side of
            // its own lane, which is the seat two places round.
            fill={SEAT_COLOURS[[1, 2, 3, 0][i]]}
          />
        ))}
      </g>
    </Frame>
  );
}

/**
 * Snakes & Ladders, from above, with the real board on it.
 *
 * The nine ladders and ten snakes are the game's own tables, and `gridOf` is
 * the game's own fold — square 1 bottom-left, every second row running back
 * the other way. That fold is why a ladder can be a straight line at all, and
 * drawing it from anything else would put 1→38 somewhere 1→38 does not go.
 */
function SnakesArt() {
  const u = BOARD.size / 10;
  const at = (square: number) => {
    const { col, row } = gridOf(square);
    return { x: BOARD.x + (col + 0.5) * u, y: BOARD.y + (row + 0.5) * u };
  };

  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      <rect x={BOARD.x} y={BOARD.y} width={BOARD.size} height={BOARD.size} rx="2" fill="#f4f1e8" />

      {/* The checker. It is what makes a hundred squares countable at a glance
          rather than a mesh. */}
      {Array.from({ length: 100 }, (_, i) => {
        const { col, row } = gridOf(i + 1);
        if ((col + row) % 2 === 1) return null;
        return (
          <rect
            key={i}
            x={BOARD.x + col * u}
            y={BOARD.y + row * u}
            width={u}
            height={u}
            fill="#e2dcc9"
          />
        );
      })}

      {/* Ladders: two rails and their rungs, so they read as ladders at 9px
          rather than as a second set of snakes in another colour. */}
      {LADDERS.map(([from, to]) => {
        const a = at(from);
        const b = at(to);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / len) * u * 0.17;
        const ny = ((b.x - a.x) / len) * u * 0.17;
        const rungs = Math.max(2, Math.round(len / (u * 0.6)));
        return (
          <g key={`l${from}`} stroke="#3FBF7F" strokeWidth="1.1" strokeLinecap="round">
            <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} />
            <line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} />
            {Array.from({ length: rungs }, (_, i) => {
              const k = (i + 0.5) / rungs;
              const cx = a.x + (b.x - a.x) * k;
              const cy = a.y + (b.y - a.y) * k;
              return (
                <line
                  key={i}
                  x1={cx + nx}
                  y1={cy + ny}
                  x2={cx - nx}
                  y2={cy - ny}
                  strokeWidth="0.7"
                />
              );
            })}
          </g>
        );
      })}

      {/* Snakes: a curve rather than a line, bowed off the straight run, with
          a head at the square that swallows you. A straight snake is a ladder
          in a different colour. */}
      {SNAKES.map(([from, to]) => {
        const a = at(from);
        const b = at(to);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const bow = u * 0.9;
        const cx = mx + (-(b.y - a.y) / len) * bow;
        const cy = my + ((b.x - a.x) / len) * bow;
        return (
          <g key={`s${from}`}>
            <path
              d={`M${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
              fill="none"
              stroke="#E8484E"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.92"
            />
            <circle cx={a.x} cy={a.y} r={u * 0.2} fill="#E8484E" />
          </g>
        );
      })}

      {/* The one square everything is aimed at. */}
      <rect
        x={BOARD.x + gridOf(100).col * u}
        y={BOARD.y + gridOf(100).row * u}
        width={u}
        height={u}
        fill="var(--color-accent, #00fff5)"
        opacity="0.85"
      />
    </Frame>
  );
}

/**
 * ECHO: a runner, and the two fainter runners that are its earlier loops.
 *
 * The ghosts are the game — the card has to show more than one of you, with
 * the number on each that says which loop it was, and the plate one of them
 * is standing on so the open door reads as their doing.
 */
function EchoArt() {
  const runner = (x: number, y: number, alpha: number, label?: string) => (
    <g key={`${x},${y}`} opacity={alpha}>
      <rect x={x - 6} y={y - 6} width="12" height="12" rx="1" fill="#e2e8f0" />
      <rect x={x - 4} y={y - 3} width="8" height="3" fill="var(--color-accent, #5ce1ff)" />
      {label && (
        <text x={x} y={y + 5} fontSize="7" fontWeight="700" fill="#0b0f1e" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      <rect x="40" y="10" width="160" height="76" fill="#141a30" />
      {/* A wall with a door in it, open, and the plate that opened it. */}
      <rect x="128" y="10" width="8" height="30" fill="#2a3358" />
      <rect x="128" y="58" width="8" height="28" fill="#2a3358" />
      <rect x="129" y="41" width="6" height="16" fill="none" stroke="#ff6a3d" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="70" cy="70" r="9" fill="rgba(92,225,255,0.25)" stroke="var(--color-accent, #5ce1ff)" strokeWidth="1.5" />
      <rect x="168" y="24" width="20" height="20" fill="rgba(125,255,176,0.12)" stroke="#7dffb0" strokeWidth="1.5" />
      {runner(70, 70, 0.35, "1")}
      {runner(100, 34, 0.35, "2")}
      {runner(148, 48, 1)}
    </Frame>
  );
}

/**
 * Gravity Shift: a ball on a wall, and the arrow that says which way down is.
 *
 * The one thing the card must not look like is a platformer. The ball sits
 * on the *side* of a pillar with the chevron pointing at it, so the picture
 * is only readable as a room where down has been turned.
 */
function GravityArt() {
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      <rect x="40" y="6" width="160" height="84" fill="#12182b" />
      <rect x="40" y="6" width="160" height="6" fill="#2b355c" />
      <rect x="40" y="84" width="160" height="6" fill="#2b355c" />
      {/* The pillar the ball is resting against, sideways. */}
      <rect x="150" y="12" width="12" height="72" fill="#2b355c" />
      <rect x="150" y="12" width="2" height="72" fill="#46538a" />
      {/* Coins along the way it fell. */}
      {[70, 95, 120].map((x) => (
        <circle key={x} cx={x} cy="48" r="4" fill="#ffd166" />
      ))}
      {/* The chevron: down is right. */}
      <path d="M186 40 L194 48 L186 56" fill="none" stroke="var(--color-accent, #5ce1ff)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="140" cy="48" r="9" fill="#ffffff" />
      <circle cx="136" cy="45" r="3" fill="rgba(0,0,0,0.15)" />
    </Frame>
  );
}

/**
 * One Bullet: the turret, a shot, and the path it takes off a wall, through
 * a mirror, into a target. The dashed line is the aim preview, which is the
 * mechanic — a bounce you can read before you take it.
 */
function BulletArt() {
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      <rect x="40" y="6" width="160" height="84" fill="#1a1424" />
      <rect x="40" y="6" width="160" height="6" fill="#3a2e4e" />
      <rect x="40" y="84" width="160" height="6" fill="#3a2e4e" />
      {/* A wall to come off. */}
      <rect x="120" y="12" width="10" height="40" fill="#3a2e4e" />
      {/* The mirror, corner to corner. */}
      <line x1="150" y1="78" x2="164" y2="64" stroke="#c8f0ff" strokeWidth="3" strokeLinecap="round" />
      {/* The path: turret → wall → mirror → target. */}
      <path
        d="M62 30 L118 30 L120 32 L157 71 L157 24"
        fill="none"
        stroke="var(--color-accent, #ffd166)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        opacity="0.85"
      />
      {/* The turret. */}
      <circle cx="58" cy="30" r="8" fill="#2a2238" stroke="var(--color-accent, #ffd166)" strokeWidth="1.5" />
      <rect x="58" y="27" width="14" height="6" fill="var(--color-accent, #ffd166)" />
      {/* The target. */}
      <circle cx="157" cy="20" r="7" fill="none" stroke="#7dffb0" strokeWidth="2" />
      <circle cx="157" cy="20" r="2.5" fill="#7dffb0" />
      {/* The shot, mid-flight. */}
      <circle cx="140" cy="53" r="3" fill="#ffffff" />
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

/**
 * SwarmRush: an arena of pellets, a few rival orbs, and you — the one in
 * the accent — with a bigger one closing in, outlined in the warning red.
 */
function SwarmArt() {
  const pellets: Array<[number, number, string]> = [
    [22, 18, "#ffd166"], [48, 70, "#7dffb0"], [70, 30, "#ff8fd6"], [96, 78, "#8fb8ff"],
    [118, 14, "#ffd166"], [150, 62, "#7dffb0"], [176, 24, "#ff8fd6"], [206, 80, "#ffd166"],
    [228, 40, "#8fb8ff"], [140, 88, "#ffd166"], [36, 44, "#8fb8ff"], [200, 16, "#7dffb0"],
  ];
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1022" />
      {/* The grid. */}
      <g stroke="#7a8cdc" strokeOpacity="0.12" strokeWidth="1">
        {[40, 80, 120, 160, 200].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="96" />)}
        {[32, 64].map((y) => <line key={y} x1="0" y1={y} x2="240" y2={y} />)}
      </g>
      {pellets.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="2.5" fill={c} />)}
      {/* Rivals. */}
      <circle cx="62" cy="58" r="9" fill="hsl(300 70% 52%)" stroke="hsl(300 80% 30%)" strokeWidth="1.5" />
      <circle cx="186" cy="60" r="7" fill="hsl(40 70% 52%)" stroke="hsl(40 80% 30%)" strokeWidth="1.5" />
      {/* The big one, closing in, with the warning ring. */}
      <circle cx="172" cy="28" r="20" fill="hsl(120 60% 45%)" stroke="hsl(120 80% 25%)" strokeWidth="2" />
      <circle cx="172" cy="28" r="24" fill="none" stroke="#ff3d6a" strokeWidth="1.5" />
      {/* You. */}
      <circle cx="118" cy="52" r="12" fill="var(--color-accent, #6ff5ff)" stroke="#2a8f9a" strokeWidth="1.5" />
      <circle cx="114" cy="48" r="3.5" fill="#ffffff" fillOpacity="0.35" />
    </Frame>
  );
}

/**
 * Reflex: three targets at three points in their life — one fresh, one half
 * gone, one nearly out and amber for it.
 *
 * The ring IS the game, so the art is three rings at three angles. A single
 * target would have shown a circle and said nothing about what the cabinet
 * asks you to do; three at different stages says "these close" without a
 * word, which is exactly the thing a shelf picture has to do.
 */
function ReflexArt() {
  return (
    <Frame>
      <rect width="240" height="96" fill="#0b1030" />
      {/* The field edge, as in the game. */}
      <rect x="10" y="8" width="220" height="80" fill="none" stroke="#eef1ff" strokeOpacity="0.06" strokeWidth="1" />

      {/* Fresh: the ring is almost whole. */}
      <circle cx="52" cy="48" r="20" fill="#10233f" />
      <circle cx="52" cy="48" r="8" fill="var(--color-accent, #22d3ee)" />
      <path d="M 52.0 33.0 A 15 15 0 1 1 40.4 38.4" fill="none" stroke="var(--color-accent, #22d3ee)" strokeWidth="3" strokeLinecap="round" />

      {/* Half gone. */}
      <circle cx="120" cy="44" r="20" fill="#10233f" />
      <circle cx="120" cy="44" r="8" fill="var(--color-accent, #22d3ee)" />
      <path d="M 120.0 29.0 A 15 15 0 0 1 121.9 58.9" fill="none" stroke="var(--color-accent, #22d3ee)" strokeWidth="3" strokeLinecap="round" />

      {/* Nearly out, and amber for it — the alarm the game turns on in the
          last third of a window. */}
      <circle cx="188" cy="54" r="20" fill="#3b1d05" />
      <circle cx="188" cy="54" r="8" fill="#f59e0b" />
      <path d="M 188.0 39.0 A 15 15 0 0 1 201.1 46.8" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />

      {/* The lives row, top left, as the game draws it. */}
      <circle cx="22" cy="16" r="3.5" fill="var(--color-accent, #22d3ee)" />
      <circle cx="34" cy="16" r="3.5" fill="var(--color-accent, #22d3ee)" />
      <circle cx="46" cy="16" r="3.5" fill="none" stroke="#eef1ff" strokeOpacity="0.25" strokeWidth="1.5" />
    </Frame>
  );
}

/**
 * Ragdoll Rumble: the Magma Gauntlet in the pack's palette. Two stone banks
 * over the lava, the bridge between them, and the two robots in their own
 * colours — violet bare-headed, amber in the hard hat — mid-exchange, with
 * the violet one's swing trail in cyan, as the game draws it.
 */
function DuelArt() {
  const bank = (x: number) => (
    <g>
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={x + k * 11} y="58" width="10" height="10" fill="#fce14b" stroke="#b8960f" strokeWidth="0.8" />
      ))}
    </g>
  );
  const robot = (x: number, limb: string, facing: 1 | -1, hat: boolean) => (
    <g>
      <line x1={x - 2} y1="57" x2={x - 1} y2="49" stroke={limb} strokeWidth="2.6" strokeLinecap="round" />
      <line x1={x + 2} y1="57" x2={x + 1} y2="49" stroke={limb} strokeWidth="2.6" strokeLinecap="round" />
      <rect x={x - 3.5} y="38" width="7" height="11" rx="2" fill="#f4f6ff" stroke="#11131c" strokeWidth="0.8" />
      <rect x={x - 5} y="29" width="10" height="9" rx="2" fill="#f4f6ff" stroke="#11131c" strokeWidth="0.8" />
      <rect x={x - 1 + facing * 1.5} y="32" width="4" height="2.6" rx="1" fill="#11131c" />
      {hat ? <path d={`M ${x - 6} 29.5 L ${x + 6} 29.5 L ${x + 4} 25 Q ${x} 22 ${x - 4} 25 Z`} fill="#f29d0c" /> : null}
    </g>
  );
  return (
    <Frame>
      <rect width="240" height="96" fill="#2a0f08" />
      <rect y="40" width="240" height="56" fill="#5a1d0a" opacity="0.6" />
      {bank(30)}
      {bank(155)}
      {/* The bridge, between the banks and a little low. */}
      {[0, 1, 2].map((k) => (
        <rect key={k} x={103 + k * 11} y="66" width="10" height="8" fill="#fce14b" stroke="#b8960f" strokeWidth="0.8" />
      ))}
      <rect y="78" width="240" height="18" fill="#ff5a1f" />
      <path d="M 0 78 Q 10 75 20 78 T 40 78 T 60 78 T 80 78 T 100 78 T 120 78 T 140 78 T 160 78 T 180 78 T 200 78 T 220 78 T 240 78" fill="none" stroke="#ffd27a" strokeWidth="1.2" />
      {/* The swing: a trail from the violet robot's weapon toward the other. */}
      <path d="M 70 30 Q 92 30 104 44" fill="none" stroke="#22d3ee" strokeWidth="4" strokeOpacity="0.55" strokeLinecap="round" />
      <line x1="66" y1="41" x2="84" y2="26" stroke="#c8d0e8" strokeWidth="1.6" strokeLinecap="round" />
      {robot(60, "#a654f4", 1, false)}
      <line x1="178" y1="40" x2="170" y2="24" stroke="#c8d0e8" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="166" y="19" width="8" height="7" rx="1" fill="#8fa3d9" />
      {robot(182, "#f29d0c", -1, true)}
      {/* The hit star. */}
      <path d="M 120 34 L 122 42 L 130 44 L 122 46 L 120 54 L 118 46 L 110 44 L 118 42 Z" fill="#fff4b8" />
    </Frame>
  );
}
