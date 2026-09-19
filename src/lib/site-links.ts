import { hasPosts } from "@/lib/blog";

/**
 * The footer's destinations, as data.
 *
 * ── Why this is not just an array inside `SiteFooter.tsx` ────────────────
 *
 * Because it is the one part of the footer worth testing, and the component
 * around it is the one part that cannot be: `SiteFooter` imports `next/link`,
 * so a `node:test` file that reached for the list would be dragging React and
 * the Next runtime into a headless assertion about five strings. The same
 * split `lib/sky-stops.ts` makes for the same reason.
 *
 * What the test then checks is the thing that actually breaks: that every href
 * here resolves to a route that exists. An ad review reaches the policy pages
 * through this list, and a footer link that 404s is worse than a missing one —
 * it is a site that looks unmaintained on the page where it is claiming to be
 * a publisher.
 */
export interface SiteLink {
  readonly href: string;
  readonly label: string;
}

/**
 * In the order a reviewer reads them: who runs this, how to reach them, what
 * they write, then the two pages with the legal answers on them.
 *
 * The blog appears only once something is published — see `lib/blog.ts`.
 */
export const footerLinks = (): SiteLink[] => [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  ...(hasPosts() ? [{ href: "/blog", label: "Blog" }] : []),
  // The editorial-standards page. It sits with the publisher links rather
  // than with the games because that is what it is: the page that says how
  // anything else on the site was arrived at, and the one a reviewer reads
  // to decide whether the numbers on twenty-seven guide pages mean anything.
  { href: "/how-courses-are-made", label: "How courses are made" },
  { href: "/controls", label: "Controls" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/browse", label: "Browse worlds" },
];
