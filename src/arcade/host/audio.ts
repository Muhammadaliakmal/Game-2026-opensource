import { audioBus } from "@/lib/audio";

/**
 * The arcade's sound, which is a few oscillators and no files.
 *
 * ── Why synthesised rather than samples ──────────────────────────────────
 *
 * A jump, a coin and a death are three short tones. Shipping them as audio
 * files would add three network requests that can fail, a decode, and a cache
 * story, to produce a noise a dozen lines of WebAudio make exactly. It also
 * makes pitch a parameter, which is what the rising coin streak needs.
 *
 * ── One graph, one mute ─────────────────────────────────────────────────
 *
 * This used to build its own AudioContext with its own `muted` flag, and
 * nothing ever set that flag: the site's mute button silenced the world and
 * left the cabinets beeping. Everything now hangs off the app's master gain
 * (`lib/audio.ts`), which is where the mute and the volume live, and which the
 * music hangs off too. The context is still created on first use rather than
 * at import — browsers refuse to start one without a gesture and warn when you
 * try, so one made at module scope is a warning on every page that touches the
 * arcade, including for players who never open a cabinet.
 *
 * The gains below are stated at their old values times three, because they
 * used to run straight into `destination` and now pass through a master sitting
 * at 0.35. Same loudness, one fader.
 */

type Voice = { freq: number; to?: number; dur: number; type: OscillatorType; gain: number };

const VOICES: Record<string, Voice> = {
  jump: { freq: 420, to: 640, dur: 0.09, type: "square", gain: 0.15 },
  land: { freq: 180, to: 120, dur: 0.07, type: "triangle", gain: 0.12 },
  coin: { freq: 880, to: 1320, dur: 0.08, type: "square", gain: 0.15 },
  place: { freq: 300, to: 300, dur: 0.05, type: "square", gain: 0.15 },
  perfect: { freq: 990, to: 1480, dur: 0.12, type: "square", gain: 0.18 },
  die: { freq: 220, to: 60, dur: 0.35, type: "sawtooth", gain: 0.21 },
  /** The near miss: a tense wobble that does not resolve. */
  close: { freq: 330, to: 311, dur: 0.28, type: "sawtooth", gain: 0.1 },
};

/**
 * Play one named sound. `semitones` shifts it, for streaks that climb.
 *
 * Every node is created per shot and stopped on a schedule rather than pooled:
 * an oscillator is the cheapest object in WebAudio, and a pool of them is a
 * pool of things that can be left running.
 */
export function sfx(name: string, semitones = 0): void {
  const v = VOICES[name];
  const bus = audioBus();
  if (!v || !bus) return;
  const ac = bus.ctx;
  if (ac.state === "suspended") void ac.resume();

  const shift = Math.pow(2, semitones / 12);
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = v.type;
  osc.frequency.setValueAtTime(v.freq * shift, t);
  if (v.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to * shift), t + v.dur);
  }
  // A ramp to zero is not representable on an exponential curve, so the tail
  // lands on a value low enough to be silent and is then cut.
  gain.gain.setValueAtTime(v.gain, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);

  osc.connect(gain).connect(bus.bus.game);
  osc.start(t);
  osc.stop(t + v.dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
