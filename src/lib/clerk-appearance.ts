import type { ClerkAppearanceTheme } from "@clerk/shared/types";

/**
 * Blockworld's Neon Drift palette, restated for Clerk.
 *
 * ── Why this file exists at all ──────────────────────────────────────────
 *
 * Clerk renders its own component tree — sign-in, sign-up, the user button,
 * and the modal the header opens — and that tree cannot read our CSS custom
 * properties for the values it has to *compute* with (see the colorNeutral
 * note below). So the palette is restated here as literals. That is a
 * genuine duplication of tokens.css and the only defence against drift is
 * this comment and the fact that both files are short. Change a token there,
 * change it here.
 *
 * ── What was wrong before ────────────────────────────────────────────────
 *
 * The old configuration set six variables and left twenty unset, which is not
 * "mostly themed" — Clerk derives most of its surface from a handful of seeds,
 * and two of the unset ones were seeds. The visible results:
 *
 *  1. UNREADABLE PRIMARY BUTTON. `colorPrimary` was #00fff5 with no
 *     `colorPrimaryForeground`, so the "Continue" label fell back to white on
 *     cyan. Relative luminance of #00fff5 is 0.781, so white on it is a
 *     contrast ratio of 1.26:1 against WCAG AA's 4.5:1 — text that is
 *     technically present and practically invisible. The app already solved
 *     this: `--color-accent-ink` exists precisely because all three mode
 *     accents are bright enough to carry dark text. Clerk was never told.
 *     Dark ink on the same cyan is 15.6:1.
 *
 *  2. THE GOOGLE BUTTON. `colorNeutral` seeds the borders, the input wells,
 *     the dividers and the social-connection buttons, and Clerk mixes it at
 *     low alpha over the background. It defaults to BLACK, which is correct
 *     on a light theme and invisible on ours — a black border at 15% over
 *     #16161f is not a border. "Continue with Google" was a shape you could
 *     only find by hovering it. On a dark theme the neutral must be the
 *     *light* end, so the derived alphas read as the white hairlines the rest
 *     of the app uses (`--border-color` is rgb(255 255 255 / 0.1)).
 *
 * ── Why literals rather than `var(--color-accent)` ───────────────────────
 *
 * `colorPrimary`, `colorNeutral`, `colorDanger` and `colorSuccess` are typed
 * `CssColorOrScale`: Clerk parses them and generates a full shade ramp
 * (hover, active, disabled, alpha variants). A `var()` reference is opaque to
 * a colour parser — it would be passed through to some declarations and break
 * every derived shade. Literals everywhere, including for the plain
 * `CssColor` slots, so the rule is one rule and not a per-field judgement.
 *
 * The accent is the neutral cyan on purpose, not the live `--color-accent`.
 * Auth is not inside any mode — you can sign in from the race, the editor or
 * the home page — and a modal that changes colour depending on which page
 * opened it reads as a bug rather than as theming.
 */

/** tokens.css `--color-base` — the page ground, deepest surface. */
const BASE = "#0a0a0f";
/** tokens.css `--color-surface` — raised chrome, one step up from the ground. */
const SURFACE = "#12121b";
/** tokens.css `--color-panel` — opaque cards on a page. */
const PANEL = "#16161f";
/** tokens.css `--color-ink` — primary text on dark. */
const INK = "#eef1ff";
/** tokens.css `--color-dim` — secondary text. */
const DIM = "#a3a8c8";
/** tokens.css `--color-accent` (build / neutral cyan). */
const ACCENT = "#00fff5";
/** tokens.css `--color-accent-ink` — text placed ON a filled accent. */
const ACCENT_INK = "#0a0a0f";
/** tokens.css `--color-danger`. */
const DANGER = "#ff3b30";
/** tokens.css `--color-accent-parkour` — reused as the success green. */
const SUCCESS = "#7cff3d";

export const clerkAppearance: ClerkAppearanceTheme = {
  variables: {
    // ── Accent ──────────────────────────────────────────────────────────
    colorPrimary: ACCENT,
    // Bug 1 above. Without this the primary button is white on cyan.
    colorPrimaryForeground: ACCENT_INK,

    // ── Surfaces and text ───────────────────────────────────────────────
    // The card is `--color-panel`, matching `.card` on the rest of the site,
    // so a Clerk modal over the home page sits at the same elevation as the
    // world cards behind it rather than floating at its own.
    colorBackground: PANEL,
    colorForeground: INK,
    colorMutedForeground: DIM,
    // Muted fills — the "or" divider row, secondary list rows. One step
    // toward the ground from the card, which is the same two-elevation rule
    // globals.css states for `.hud-panel` and `.card`.
    colorMuted: SURFACE,

    // Bug 2 above. Light, because every alpha Clerk derives from this is
    // composited over a dark card.
    colorNeutral: INK,

    // ── Inputs ──────────────────────────────────────────────────────────
    // The well is darker than the card it sits in — a recessed field reads as
    // editable without needing a heavy border to say so.
    colorInput: BASE,
    colorInputForeground: INK,
    colorBorder: "rgba(255, 255, 255, 0.12)",

    // The focus ring is the accent, which is the one thing globals.css calls a
    // quality floor: ":focus-visible { outline: 2px solid var(--color-accent) }"
    // is never removed, and Clerk's tree should not be the exception.
    colorRing: ACCENT,
    colorShadow: "rgba(0, 0, 0, 0.55)",
    // `--lift` over the page, not Clerk's default light scrim, which greys the
    // neon out from behind the modal.
    colorModalBackdrop: "rgba(10, 10, 15, 0.72)",

    // ── Status ──────────────────────────────────────────────────────────
    colorDanger: DANGER,
    colorSuccess: SUCCESS,
    // `colorWarning` is deliberately left at Clerk's default. There is no
    // warning token in tokens.css, and inventing an amber here would put a
    // colour on screen that no other surface in the app can match.

    // ── Type ────────────────────────────────────────────────────────────
    // These DO resolve as `var()`: the font variables are declared on <html>
    // by the root layout, custom properties inherit, and Clerk's tree — modal
    // portals included — renders inside <body>. They are also never parsed,
    // only emitted, so the rule about literals above does not apply.
    fontFamily: "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
    // Buttons take the UI face too. globals.css is explicit that button
    // labels are "read, not shouted" — the display face belongs to headings.
    fontFamilyButtons: "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
    // The verification-code field is a row of digits, and `.num` in
    // globals.css says every number in the app is mono with tabular figures.
    fontFamilyMono: "var(--font-jetbrains), ui-monospace, monospace",

    // `--radius`. Interactive chrome is barely rounded; a pill would stop
    // reading as part of this interface.
    borderRadius: "3px",
  },

  /*
   * ── Why there is an `elements` block, and why it is this small ──────────
   *
   * This repo has been burned by patching a library's internals through
   * string keys before — see materials.test.ts, which exists because a
   * `replace()` against three's shader source shipped broken and could only
   * fail at runtime. The instinct to avoid that here is right, but the risk is
   * not the same shape: an `elements` key Clerk renames does not throw, does
   * not fail to compile and does not break auth. The style simply stops
   * applying and the variables above still carry the theme. Benign failure,
   * so a small number of stable keys is a fair trade for the one thing
   * variables genuinely cannot express — the display face on the heading.
   *
   * Kept to headings only. Anything more and this becomes a stylesheet for a
   * component tree we do not own.
   */
  elements: {
    headerTitle: {
      fontFamily: "var(--font-orbitron), var(--font-plex), sans-serif",
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
  },
};
