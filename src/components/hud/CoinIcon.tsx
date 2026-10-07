/**
 * The coin, from the UI art set (`npm run ui:art`), at text size.
 *
 * One component so a price, a balance and a reward all draw the same coin —
 * prices were a `⬤` glyph while the header showed the art, which read as two
 * currencies. A background rather than an <img>: it is decoration, and the
 * number beside it is the content.
 */
export function CoinIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat align-[-0.15em] ${className}`}
      style={{ width: size, height: size, backgroundImage: "url(/ui/coin.webp)" }}
    />
  );
}
