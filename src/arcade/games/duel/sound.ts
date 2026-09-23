import { audioBus, duckBus, jitter, noiseHit, toneHit } from "@/lib/audio";
import { getFightPack } from "@/arcade/sound-pack";
import { VIEW_W } from "./tuning";

/**
 * What a fight sounds like.
 *
 * The duel shipped on the arcade's seven-voice table, so a punch was `place` —
 * the 50 ms square blip Tower Stack drops a block with — and a knockout was
 * the runner's death sweep. Every other cabinet is a tone game and those are
 * right there. A fight is not: it is two metal bodies hitting each other, and
 * the one thing a hit must sound like is *weight*.
 *
 * Synthesised on the app's graph like everything else (see `lib/audio.ts`),
 * for the same reason — no files, no decode, and pitch is a parameter.
 *
 * ── Three rules the numbers below keep ──────────────────────────────────
 *
 * - **On the `impact` bus.** Settings → Sound → Impacts is the slider for
 *   bodies hitting things, and a fight is almost nothing else. The round and
 *   match stingers stay on the arcade's own table: they are announcements.
 * - **Every repeat is jittered and voice-capped.** A flurry of eight hits is
 *   eight different hits, not one sample machine-gunned, and never more than
 *   four sounding at once.
 * - **The weight is in the noise, not the sine.** CLAUDE.md's phone-speaker
 *   rule: a phone carries nothing under ~200 Hz, so a thud that is only a low
 *   sine is silence there. Each low tone has a band of filtered noise with it
 *   that a phone does carry, and the sine is what headphones add.
 *
 * The shared noise buffer is 0.4 s and does not loop, so no burst here is
 * longer than that.
 *
 * ── Four packs, one event map ────────────────────────────────────────────
 *
 * Chosen on the pause screen (`arcade/sound-pack.ts`) and read on every call,
 * so a change lands on the next hit. `metal` is the default and the kit the
 * rules above were written for; `heavy` is the same bodies twice the size;
 * `cartoon` swaps weight for bonks and slide whistles; `retro` is square
 * waves and noise played back slow, which is how an 8-bit chip made noise.
 * Every pack answers every event, so choosing one never silences anything.
 */

/** Where on the stereo field a view-x lands. Kept inside ±0.6: hard-panned hits tire the ear. */
function panAt(x: number): number {
  const p = (x / VIEW_W) * 2 - 1;
  return Math.max(-1, Math.min(1, p)) * 0.6;
}

/**
 * A blow landing.
 *
 * Three layers: the body (noise, brighter for a fast light hit, darker for
 * a heavy one), the ring of struck plate (a short square, lower for the maul
 * than the rebar because the maul is the heavier thing), and on a heavy hit a
 * thud under both. A head hit adds a high clank — it is the hit worth hearing.
 */
export function hitSound(
  dmg: number,
  heavy: boolean,
  head: boolean,
  x: number,
  weapon: string
): void {
  const pan = panAt(x);
  const weight = Math.min(1, dmg / 30);
  const pack = getFightPack();

  if (pack === "cartoon") {
    // A bonk: a sine that jumps up, pitched down for a bigger hit.
    toneHit((720 - weight * 260) * jitter(0.08), 0.12, 0.16 + weight * 0.1, "sine", {
      bus: "impact",
      pan,
      glide: 1.9,
      voice: "duel-hit",
    });
    noiseHit(0.03, 5000, 0.08, { bus: "impact", pan, voice: "duel-hit" });
    if (heavy) {
      toneHit(180, 0.3, 0.2, "sine", { bus: "impact", pan, glide: 2.6, voice: "duel-thud", maxVoices: 2 });
    }
    if (head) {
      toneHit(1900, 0.1, 0.06, "triangle", { bus: "impact", pan, glide: 1, voice: "duel-head", maxVoices: 2 });
    }
    return;
  }

  if (pack === "retro") {
    // Chip noise: the shared buffer played slow is coarse, stepped hiss.
    noiseHit(0.08 + weight * 0.06, 9000, 0.2 + weight * 0.12, {
      bus: "impact",
      pan,
      rate: 0.28,
      voice: "duel-hit",
    });
    toneHit((heavy ? 110 : 220) * jitter(0.03), 0.1, 0.1, "square", {
      bus: "impact",
      pan,
      glide: 0.5,
      voice: "duel-ring",
      maxVoices: 3,
    });
    if (head) {
      toneHit(1320, 0.06, 0.06, "square", { bus: "impact", pan, glide: 1, voice: "duel-head", maxVoices: 2 });
    }
    return;
  }

  const big = pack === "heavy";
  noiseHit(0.05 + weight * 0.08, (heavy ? 1500 : 3200) * (big ? 0.6 : 1) * jitter(0.1), 0.22 + weight * 0.2, {
    bus: "impact",
    pan,
    rate: jitter(0.08),
    voice: "duel-hit",
  });
  const ring = (weapon === "maul" ? 380 : 720) * (big ? 0.6 : 1);
  toneHit(ring * jitter(0.06), 0.09 + weight * 0.06, 0.05 + weight * 0.05, "square", {
    bus: "impact",
    pan,
    glide: 0.86,
    voice: "duel-ring",
    maxVoices: 3,
  });
  if (heavy || (big && weight > 0.3)) {
    toneHit((big ? 110 : 150) * jitter(0.05), big ? 0.32 : 0.22, 0.3, "sine", {
      bus: "impact",
      pan,
      glide: 0.45,
      voice: "duel-thud",
      maxVoices: 2,
    });
    noiseHit(big ? 0.26 : 0.16, big ? 600 : 800, 0.28, { bus: "impact", pan, voice: "duel-thud", maxVoices: 2 });
  }
  if (head) {
    toneHit(1250 * jitter(0.04), 0.08, 0.07, "triangle", { bus: "impact", pan, glide: 1.12, voice: "duel-head", maxVoices: 2 });
  }
}

/** Weapon on weapon: bright, dry, and nobody's body in it. */
export function clashSound(speed: number, x: number): void {
  const pan = panAt(x);
  const g = Math.min(0.12, 0.05 + speed / 20000);
  const clash = { bus: "impact" as const, pan, voice: "duel-clash", maxVoices: 2 };
  switch (getFightPack()) {
    case "cartoon":
      toneHit(1600, 0.35, 0.08, "triangle", { ...clash, glide: 1 });
      return;
    case "retro":
      toneHit(1760, 0.08, g, "square", { ...clash, glide: 1 });
      toneHit(2640, 0.08, g * 0.7, "square", { ...clash, glide: 1, at: 0.05 });
      return;
    case "heavy":
      toneHit(620 * jitter(0.03), 0.3, g, "square", { ...clash, glide: 0.97 });
      noiseHit(0.08, 3500, 0.16, clash);
      return;
    case "metal":
      toneHit(1180 * jitter(0.03), 0.14, g, "square", { ...clash, glide: 0.97 });
      toneHit(1570 * jitter(0.03), 0.1, g * 0.7, "square", { ...clash, glide: 0.95 });
      noiseHit(0.04, 6000, 0.12, clash);
  }
}

/**
 * A charged swing let go: a band of noise swept upward and swelled, which is
 * what air moved fast sounds like. `power` is the charge, 0..1.
 *
 * Built here rather than from `noiseHit`, which is lowpass and starts at full
 * gain — a hit's envelope. A whoosh has to *arrive*.
 */
export function whooshSound(power: number): void {
  const pack = getFightPack();
  if (pack === "cartoon") {
    // The slide whistle.
    toneHit(500, 0.28, 0.08 + power * 0.06, "sine", { bus: "impact", glide: 3.2, voice: "duel-whoosh", maxVoices: 2 });
    return;
  }
  if (pack === "retro") {
    toneHit(300, 0.14, 0.06 + power * 0.05, "square", { bus: "impact", glide: 2.5, voice: "duel-whoosh", maxVoices: 2 });
    return;
  }

  const a = audioBus();
  if (!a || a.ctx.state !== "running") return;
  const big = pack === "heavy";
  const dur = (0.18 + power * 0.14) * (big ? 1.35 : 1);
  const now = a.ctx.currentTime;

  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  src.playbackRate.value = jitter(0.06);
  const band = a.ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(500, now);
  band.frequency.exponentialRampToValueAtTime((2600 + power * 1400) * (big ? 0.55 : 1), now + dur);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.16 + power * 0.14, now + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(band).connect(env).connect(a.bus.impact);
  src.start(now);
  src.stop(now + dur);
  src.onended = () => {
    src.disconnect();
    band.disconnect();
    env.disconnect();
  };
}

/** A servo drawing back: a short rising buzz that tells you what is coming. */
export function windupSound(): void {
  const windup = { bus: "impact" as const, voice: "duel-windup", maxVoices: 2 };
  switch (getFightPack()) {
    case "cartoon":
      toneHit(900, 0.2, 0.05, "sine", { ...windup, glide: 0.5 });
      return;
    case "retro":
      toneHit(440, 0.16, 0.04, "square", { ...windup, glide: 1.5 });
      return;
    case "heavy":
      toneHit(160 * jitter(0.05), 0.26, 0.05, "sawtooth", { ...windup, glide: 1.7 });
      return;
    case "metal":
      toneHit(260 * jitter(0.05), 0.22, 0.045, "sawtooth", { ...windup, glide: 1.7 });
  }
}

/**
 * The knockout. A boom, a long struck-bell ring, and the music pulled down
 * under both so the moment is the loudest thing in the room — the same beat
 * the slow-motion gives the picture, which reduced motion drops and this
 * does not.
 */
export function koSound(x: number): void {
  const pan = panAt(x);
  const pack = getFightPack();
  duckBus("music", 0.25, 0.9, 0.6);

  if (pack === "cartoon") {
    // Down the slide whistle, then the bonk that ends it.
    toneHit(1600, 0.6, 0.1, "sine", { bus: "impact", pan, glide: 0.2 });
    toneHit(260, 0.3, 0.2, "sine", { bus: "impact", pan, glide: 1.8, at: 0.55 });
    return;
  }
  if (pack === "retro") {
    // The chip's game-over: three falling squares over a crunch.
    [523, 392, 262].forEach((f, i) => toneHit(f, 0.2, 0.12, "square", { bus: "impact", glide: 1, at: i * 0.18 }));
    noiseHit(0.38, 9000, 0.2, { bus: "impact", pan, rate: 0.22 });
    return;
  }

  const big = pack === "heavy";
  toneHit(big ? 70 : 95, 0.6, 0.38, "sine", { bus: "impact", pan, glide: 0.4 });
  noiseHit(0.38, big ? 800 : 1100, 0.34, { bus: "impact", pan });
  toneHit(big ? 310 : 520, 1.1, 0.07, "triangle", { bus: "impact", glide: 0.985 });
  toneHit(big ? 466 : 783, 0.9, 0.035, "triangle", { bus: "impact", glide: 0.985 });
}

/** Metal into lava: a hiss over a low sink. */
export function burnSound(x: number): void {
  const pan = panAt(x);
  switch (getFightPack()) {
    case "cartoon":
      noiseHit(0.38, 7000, 0.1, { bus: "impact", pan, rate: 1.3 });
      toneHit(700, 0.5, 0.1, "sine", { bus: "impact", pan, glide: 0.3 });
      return;
    case "retro":
      noiseHit(0.38, 9000, 0.2, { bus: "impact", pan, rate: 0.25 });
      toneHit(330, 0.3, 0.08, "square", { bus: "impact", pan, glide: 0.4 });
      return;
    case "heavy":
    case "metal":
      noiseHit(0.38, 7000, 0.14, { bus: "impact", pan, rate: 1.3 });
      noiseHit(0.3, 700, 0.22, { bus: "impact", pan, rate: 0.8 });
      toneHit(180, 0.4, 0.12, "sine", { bus: "impact", pan, glide: 0.5 });
  }
}
