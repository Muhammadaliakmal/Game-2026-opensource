import { Shop } from "@/components/shop/Shop";

/**
 * The shop.
 *
 * A thin server shell around a client component, for one reason: the wallet is
 * per-account and changes when you press things, so the page itself is a
 * function of a fetch rather than of the repo — unlike `/parkour`, which is
 * static because everything on it comes from code.
 */
export const metadata = {
  title: "Characters — Spec Driven Games",
  description: "Earn coins on the courses. Spend them on somebody new to be.",
  /*
   * `noindex`, for the same reason `/play/<slug>` is.
   *
   * `<Shop>` is a client component whose whole content is a wallet and a grid
   * that arrive after a fetch, so what a crawler receives from this URL is
   * about a hundred and forty words of chrome. That is a thin page, and a
   * thin page in the sitemap is a page you have asked to be judged on.
   *
   * There is nothing to fix by writing more here: this is an account screen,
   * not an article. It is excluded from the sitemap too, and `follow` stays
   * on so the links out of it still count.
   */
  robots: { index: false, follow: true },
};

export default function ShopPage() {
  return <Shop />;
}
