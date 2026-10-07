import { playMusic, stopMusicFor, musicIsPlaying } from "@/lib/music/engine";
import { PHONK_BASS, PHONK_KICKS, PHONK_RIFFS, type StyleId } from "@/lib/music/styles";

/**
 * The arcade's music, as one owner of the game's band (`lib/music/engine.ts`).
 *
 * This file used to BE the band — a phonk sequencer every cabinet played at
 * its own tempo. The band now performs a style per mode (`lib/music/styles.ts`)
 * and a cabinet names its style in the registry; phonk is still the action
 * cabinets' and its tables are re-exported here for the tests that pin them.
 *
 * The arcade's request sits on top of whatever the world under it was playing,
 * so closing a cabinet over a parkour course brings the night run back rather
 * than silence.
 */

export const PENTATONIC = [0, 3, 5, 7, 10];
export const KICKS = PHONK_KICKS;
export const RIFFS = PHONK_RIFFS;
export const BASS = PHONK_BASS;

const OWNER = "arcade";

/** Start the cabinet's track. A second call with the same seed is a no-op. */
export function startMusic(seed: number, bpm?: number, style: StyleId = "phonk"): void {
  playMusic(OWNER, style, seed, bpm);
}

export function stopMusic(): void {
  stopMusicFor(OWNER);
}

export const musicPlaying = musicIsPlaying;
