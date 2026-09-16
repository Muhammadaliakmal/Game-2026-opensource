/**
 * Every number SwarmRush has.
 *
 * ── The one idea ─────────────────────────────────────────────────────────
 *
 * You are a glowing orb in a field of smaller glowing orbs. Move over
 * matter and you grow; grow past another orb and you can eat it; let one
 * grow past you and it can eat you. One input — where you point is where
 * you go — and one goal, which is the whole `.io` genre in a sentence. Two
 * abilities on top: a dash that costs mass, and a split that halves you
 * into two orbs steering together.
 *
 * ── A run has a shape ────────────────────────────────────────────────────
 *
 * The genre's servers run forever; a cabinet cannot. So a run is one
 * hundred seconds of the ordinary arena, then **Big Mode**: the world grows,
 * more and larger orbs arrive, and a storm ring closes on the centre for the
 * next seventy-five seconds. Survive to the end and you are *placed* among
 * whoever is left. Three lives, two seconds to respawn — dying costs a life
 * and a little pride, not the run.
 *
 * ── Bots, not sockets ────────────────────────────────────────────────────
 *
 * The other orbs are bots with a personality number. The doc's build order
 * puts bots before multiplayer, and a cabinet that needs somebody else
 * online to be any fun is a cabinet nobody plays at 3 a.m. — the arena was
 * cut for exactly that. The simulation is pure and the bots are seeded, so a
 * real room could drive the same orbs later.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 *
 * World coordinates are centred on the origin so the world can grow in
 * place. Mass is the unit of everything: radius is `RADIUS_K · √mass`, speed
 * falls with mass, and the score counts mass eaten.
 */

export const VIEW_W = 960;
export const VIEW_H = 540;

/** ── The world ─────────────────────────────────────────────────────────── */

/** Side of the square world, in world pixels, before Big Mode. */
export const WORLD = 2600;
/** Side after Big Mode expands it. */
export const WORLD_BIG = 4200;
/** Spacing of the background grid lines. */
export const GRID = 100;

/** ── Mass, size, speed ─────────────────────────────────────────────────── */

/** Starting mass of a fresh orb. */
export const START_MASS = 20;
/** radius = RADIUS_K · √mass. Mass 20 is a 18 px orb; mass 2000 a 180 px one. */
export const RADIUS_K = 4;
/** Speed of a fresh orb, world px/s. */
export const SPEED_BASE = 270;
/** speed = SPEED_BASE · (START_MASS / mass)^SPEED_EXP, so big is slow. */
export const SPEED_EXP = 0.24;
/** Nobody crawls slower than this, however big. */
export const SPEED_MIN = 85;
/** How quickly velocity chases the steering, per second. Higher is twitchier. */
export const ACCEL = 9;
/** Pointer offsets from centre under this steer nothing… */
export const STEER_DEAD_PX = 22;
/** …and past this steer at full speed. In view pixels. */
export const STEER_FULL_PX = 90;
/** Mass above which an orb slowly bleeds mass, so nothing snowballs forever. */
export const DECAY_ABOVE = 180;
/** Fraction of mass lost per second above `DECAY_ABOVE`. */
export const DECAY_RATE = 0.004;

/** ── Eating ────────────────────────────────────────────────────────────── */

/** An orb must be this many times heavier to eat another. */
export const EAT_RATIO = 1.25;
/** …and have the victim's centre this far inside its own edge (fraction of victim radius). */
export const EAT_DEPTH = 0.35;
/** Fraction of a victim's mass the eater keeps. */
export const EAT_GAIN = 0.85;

/** ── Matter ────────────────────────────────────────────────────────────── */

/**
 * Dense on purpose. A fresh orb sweeps a strip forty-odd pixels wide at
 * 270 px/s, and the doc asks for visible growth every second or two: at
 * this density that is about two pellets a second from the first moment.
 */
export const MATTER_N = 900;
export const MATTER_N_BIG = 1800;
export const MATTER_MASS = 2;
export const MATTER_R = 5;
/** Cell size of the matter grid. A big orb spans a few cells; a small one, one. */
export const MATTER_CELL = 160;

/** ── Bots ──────────────────────────────────────────────────────────────── */

export const BOTS = 22;
export const BOTS_BIG = 40;
/** A bot spawns with mass in this range in the ordinary arena. */
export const BOT_MASS_MIN = 10;
export const BOT_MASS_MAX = 110;
/** Seconds between a bot's decisions (jittered ±40%). */
export const AI_THINK_S = 0.35;
/** A bot notices a bigger orb within its radius × this + this many px. */
export const FLEE_R_K = 3;
export const FLEE_R_PX = 220;
/** A bot hunts a smaller orb within its radius × this + this many px… */
export const HUNT_R_K = 3;
export const HUNT_R_PX = 360;
/**
 * …but not one under this fraction of its own mass. A fresh orb is not
 * worth a chase to a big one, which is what gives a new life its first
 * thirty seconds — the same mercy the genre's servers have by accident,
 * because a giant cannot catch a speck.
 */
export const HUNT_MIN_RATIO = 0.2;
/** How many pellets a bot samples when choosing where to graze. */
export const GRAZE_SAMPLES = 10;
/** Seconds a dead bot waits before a fresh one takes its seat. */
export const BOT_RESPAWN_S = 3;
/** A bot keeps this far inside the world edge, in px, before turning in. */
export const EDGE_MARGIN = 120;

/** ── Hazards ───────────────────────────────────────────────────────────── */

export const SPIKES = 6;
export const SPIKES_BIG = 12;
export const SPIKE_R_MIN = 55;
export const SPIKE_R_MAX = 95;
/** Fraction of mass an orb loses per second while touching a spike zone. */
export const HAZARD_DRAIN = 0.12;
/** Spikes stay this far from the centre, where everyone respawns. */
export const SPIKE_CLEAR = 260;

/** ── Dash ──────────────────────────────────────────────────────────────── */

/** Fraction of mass a dash costs. */
export const DASH_COST = 0.05;
export const DASH_MULT = 2.7;
export const DASH_S = 0.32;
export const DASH_CD_S = 2.4;
/** A press is a tap (and so a dash) if it lifts within this many steps… */
export const TAP_STEPS = 14;
/** …having moved less than this many view pixels. */
export const TAP_MOVE_PX = 18;

/** ── Split ─────────────────────────────────────────────────────────────── */

export const SPLIT_MIN_MASS = 60;
/** The launched half leaves at this speed and decays back to normal. */
export const SPLIT_LAUNCH = 640;
export const SPLIT_LAUNCH_DECAY = 3.5;
/** Seconds before two halves may merge again. */
export const SPLIT_MERGE_S = 8;
/**
 * Once they may, the halves drift together at this fraction of their
 * distance per second, so a split heals on its own rather than needing to be
 * steered back into itself.
 */
export const MERGE_PULL = 2.5;
export const SPLIT_CD_S = 1;
/** The on-screen split button, in view pixels from the bottom-right corner. */
export const SPLIT_BTN = { size: 64, margin: 18 };

/** ── The run ───────────────────────────────────────────────────────────── */

export const LIVES = 3;
/** Seconds of the ordinary arena before Big Mode. */
export const NORMAL_S = 100;
/** Seconds the Big Mode announcement holds before the ring starts moving. */
export const BIG_INTRO_S = 6;
/** Seconds the ring takes to close from the world edge to `RING_MIN`. */
export const BIG_S = 75;
/** The ring stops shrinking at this radius… */
export const RING_MIN = 240;
/** …and holds there this long before the round is called. */
export const RING_HOLD_S = 8;
/** Fraction of mass per second lost outside the ring. */
export const STORM_DRAIN = 0.1;
/** An orb the storm has worn under this mass is gone. */
export const STORM_KILL_MASS = 6;
/** Seconds between death and the next life. */
export const RESPAWN_S = 1.8;
/**
 * Seconds a fresh orb cannot be eaten. Long enough to read the room and
 * pick a direction; it ends the moment you eat another orb, so it cannot be
 * hidden behind.
 */
export const SPAWN_SHIELD_S = 3;
/** Steps the death is held frozen before the respawn timer starts counting. */
export const DEATH_STEPS = 18;

/** ── Scoring ───────────────────────────────────────────────────────────── */

export const KILL_POINTS = 60;
/** Bonus for the place you hold when the ring is called; 1st, 2nd, 3rd. */
export const PLACE_POINTS = [500, 300, 150];
/** Per life left at the end of a survived round. */
export const LIFE_POINTS = 100;

/** ── Camera and juice ──────────────────────────────────────────────────── */

/** zoom = clamp(ZOOM_NUM / (ZOOM_BASE + r / ZOOM_R), ZOOM_MIN, ZOOM_MAX). */
export const ZOOM_NUM = 1.1;
export const ZOOM_BASE = 0.8;
export const ZOOM_R = 70;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 1.25;
/** How fast the camera zoom and position ease, per second. */
export const CAM_EASE = 4;
/** A bigger orb this close (in radii) reads as a threat and the screen says so. */
export const THREAT_RADII = 2.2;
export const SHAKE_PX = 7;
export const SHAKE_DECAY = 0.25;
/** Steps the orb stays squashed after a bite. */
export const SQUASH_STEPS = 8;
/** How many kill-feed lines the HUD keeps. */
export const FEED_LINES = 4;
export const FEED_S = 4;
/** Leaderboard rows. */
export const BOARD_ROWS = 5;
