/**
 * AdSense: who we are, and where an ad is allowed to appear.
 *
 * ── Why the slot ids are blank ───────────────────────────────────────────
 *
 * The loader script in `app/layout.tsx` is enough for **Auto ads**, which
 * Google places itself once the switch is on in the AdSense dashboard. It is
 * NOT enough for a manual unit: that needs a `data-ad-slot`, and a slot id is
 * minted by AdSense against this publisher account. It cannot be invented
 * here, and a wrong one does not fail loudly — it renders an empty box.
 *
 * So each entry below starts empty and `AdSlot` renders nothing until it is
 * filled. Create the unit in AdSense (Ads → By ad unit → Display ad), paste
 * the numeric id, and that placement turns on. Nothing else has to change.
 *
 * ── Where ads are NOT ────────────────────────────────────────────────────
 *
 * Nowhere a session is running: `/play`, `/race`, `/parkour`'s
 * course itself, `/build`. Two reasons, and the second is the load-bearing
 * one. An ad beside a 60fps canvas competes with it for the main thread and
 * for the frame budget 6f measures. And an ad next to a control someone is
 * tapping at speed is an accidental click, which is the kind of traffic that
 * gets a publisher account closed rather than paid.
 *
 * The shop is deliberately excluded too. SPEC.md §1 prohibits "confusing /
 * counterintuitive purchase flows"; a real-money ad next to a coin price is
 * exactly that, whoever served it.
 */

/** The publisher id. Public by design — it ships in the page source. */
export const AD_CLIENT = "ca-pub-7628761325825840";

/**
 * One id per placement, from AdSense → Ads → By ad unit.
 *
 * Empty string means "not created yet": the placement is wired up and inert,
 * so turning it on is a paste rather than a code change.
 */
export const AD_SLOTS = {
  /** Home, under the world list. Below the fold on every size. */
  home: "",
  /** The public gallery, under the published grid. */
  browse: "",
} as const;

export type AdPlacement = keyof typeof AD_SLOTS;
