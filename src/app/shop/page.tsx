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
};

export default function ShopPage() {
  return <Shop />;
}
