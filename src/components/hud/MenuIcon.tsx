/**
 * The icons on a menu row, as one file.
 *
 * ── Why inline SVG and not an icon package ───────────────────────────────
 *
 * The whole set below is under 2 kB of markup and ships inside the component
 * that already had to load. An icon library is a dependency, a tree-shaking
 * question and a second visual language to keep in step with a HUD that is
 * drawn from rectangles and 45° corners — for eleven glyphs that never change.
 *
 * ── The rules they are drawn to ──────────────────────────────────────────
 *
 * One 16-unit box, `currentColor`, 1.6 stroke, round caps. `currentColor` is
 * what makes them free to place: a menu row that is disabled, hovered or
 * armed recolours its text, and the icon comes with it rather than needing a
 * variant per state. Nothing here is filled, so a glyph reads at 14px on a
 * dark panel without turning into a blob.
 *
 * They are decoration, not information — every row keeps the words it always
 * had — so each is `aria-hidden` and the set never becomes something a screen
 * reader has to interpret.
 */
export type IconName =
  | "view"
  | "level"
  | "respawn"
  | "restart"
  | "sound"
  | "fullscreen"
  | "settings"
  | "edit"
  | "exit"
  | "keyboard"
  | "touch"
  | "display";

/** Path data only — every glyph shares the frame and the stroke below. */
const PATHS: Record<IconName, React.ReactNode> = {
  // An eye: first person, third person, the thing you are looking through.
  view: (
    <>
      <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  // A horizon with a centre tick: levelling the view.
  level: (
    <>
      <path d="M2 8h12" />
      <path d="M8 5.2v5.6" />
      <path d="M4.6 5.6 2 8l2.6 2.4M11.4 5.6 14 8l-2.6 2.4" />
    </>
  ),
  // A pin dropping back onto a marker: the last checkpoint.
  respawn: (
    <>
      <path d="M8 2v6" />
      <path d="M5.6 5.6 8 8l2.4-2.4" />
      <path d="M3 10.5h10" />
      <path d="M4.5 13h7" />
    </>
  ),
  // A loop back to the start: the clock from zero.
  restart: (
    <>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.9-4" />
      <path d="M13.4 2.4v3.4H10" />
    </>
  ),
  // A speaker. The mute state is the row's own business; this is the subject.
  sound: (
    <>
      <path d="M3 6.2h2.2L8.4 3.6v8.8L5.2 9.8H3Z" />
      <path d="M10.8 6.1a2.7 2.7 0 0 1 0 3.8" />
      <path d="M12.6 4.3a5.2 5.2 0 0 1 0 7.4" />
    </>
  ),
  // Four corners pushing outward.
  fullscreen: (
    <>
      <path d="M2.5 6V2.5H6" />
      <path d="M10 2.5h3.5V6" />
      <path d="M13.5 10v3.5H10" />
      <path d="M6 13.5H2.5V10" />
    </>
  ),
  // Sliders, not a cog: this menu is a list of values you set.
  settings: (
    <>
      <path d="M2.5 4.6h11M2.5 11.4h11" />
      <circle cx="6" cy="4.6" r="1.6" />
      <circle cx="10.5" cy="11.4" r="1.6" />
    </>
  ),
  // A block with a corner lifted: the editor, and the wordmark's own shape.
  edit: (
    <>
      <path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5Z" />
      <path d="M2.4 5 8 8.2 13.6 5M8 8.2v5.9" />
    </>
  ),
  // A door with an arrow leaving it.
  exit: (
    <>
      <path d="M9.6 2.5H3.4v11h6.2" />
      <path d="M7 8h6.4" />
      <path d="M11.2 5.8 13.5 8l-2.3 2.2" />
    </>
  ),
  keyboard: (
    <>
      <rect x="1.8" y="4" width="12.4" height="8" rx="1.2" />
      <path d="M4.3 6.6h.01M6.8 6.6h.01M9.2 6.6h.01M11.7 6.6h.01" />
      <path d="M5 9.4h6" />
    </>
  ),
  // A thumb on a pad.
  touch: (
    <>
      <path d="M6.4 8.6V4.3a1.4 1.4 0 0 1 2.8 0v3.1" />
      <path d="M9.2 7.4a1.3 1.3 0 0 1 2.6 0v2.2a3.9 3.9 0 0 1-3.9 3.9H7.5a3.3 3.3 0 0 1-2.4-1L3.2 10.6a1.2 1.2 0 0 1 1.8-1.6l1.4 1.4" />
    </>
  ),
  // A screen: brightness, scale, the things you look at rather than press.
  display: (
    <>
      <rect x="1.8" y="3" width="12.4" height="8.4" rx="1.2" />
      <path d="M5.6 13.6h4.8" />
      <path d="M8 11.4v2.2" />
    </>
  ),
};

/**
 * One glyph, sized to sit on a row of `--text-2xs` without pushing it taller.
 *
 * `shrink-0` because every place this goes is a flex row that is allowed to
 * truncate its label — an icon that shrinks instead is an icon that turns
 * into a sliver on a narrow phone.
 */
export function MenuIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
