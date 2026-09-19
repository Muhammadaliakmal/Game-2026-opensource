import type { Metadata } from "next";
import { WorldMount } from "@/components/world/WorldMount";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";
import { RememberPlay } from "@/components/RememberPlay";
import { getBuiltInWorld } from "@/lib/built-in-worlds";
import { CountPlay } from "@/components/stats/CountPlay";
import { bySlug } from "@/content/registry";
import { notesFor } from "@/content/course-notes";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The game itself, at a shareable link.
 *
 * ── Why this page is `noindex` ───────────────────────────────────────────
 *
 * It is a canvas. A crawler does not run WebGL, so what it receives from this
 * URL is a document with a mount point and no words in it — and there are
 * twenty-seven shipped worlds, so what it receives from the SITE is
 * twenty-seven near-identical wordless documents. That is not a description
 * of a site with thin pages on it; that is the definition of one, and it is
 * what an ad review means by auto-generated content with no unique value.
 *
 * The answer is not to bolt text onto a game screen, which would make the
 * game worse to serve a crawler. It is to put the readable half somewhere of
 * its own: `/games/<slug>` is a written guide to this world, with the
 * geometry measured and the route described, and it is the URL in the
 * sitemap and the one canonical here.
 *
 * `follow` stays on. The page is still a real part of the site and the links
 * out of it — to the ladder, to the guide — are worth following; it is being
 * excluded from the index, not disowned.
 *
 * ── The metadata is not pointless on a noindexed page ────────────────────
 *
 * A `/play/<slug>` link is the one people actually paste into chat, because
 * it is the one that opens the game. Without a title and an Open Graph card
 * every one of those unfurls as the site's generic description, on the link
 * that gets shared most. Indexing and unfurling are different systems.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const built = getBuiltInWorld(id);

  // A world somebody published is a uuid with a row behind it. Its name is
  // loaded by the canvas, so there is nothing to put here that would not be a
  // database round trip on the game's own critical path.
  if (!built) {
    return {
      title: `Play — ${SITE_NAME}`,
      robots: { index: false, follow: true },
    };
  }

  const entry = bySlug.get(id);
  const notes = notesFor(id);
  return {
    title: `Play ${built.name} — ${SITE_NAME}`,
    description: notes?.what.slice(0, 200) ?? built.blurb,
    // The guide is the indexable version of this world. Saying so here means
    // a link somebody shares still consolidates onto the page with the words.
    alternates: { canonical: `${SITE_URL}/games/${id}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${built.name} · ${SITE_NAME}`,
      description: built.blurb,
      url: `${SITE_URL}/play/${id}`,
      images: entry?.thumb ? [{ url: entry.thumb }] : undefined,
    },
  };
}

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The shareable link. Same canvas as /build/<id>, opened in play mode.
  return (
    <>
      <WorldMount worldId={id} initialMode="play" />
      {/* A built-in world has a name here; a player's world is loaded by the
          canvas and named there, so the chip says "a world" for it. */}
      <RememberPlay
        href={`/play/${id}`}
        title={getBuiltInWorld(id)?.name ?? "a world"}
        kind="world"
        // A built-in world's id IS its registry slug. A published world's is a
        // uuid, which is not in the registry — the rail shows it by name with
        // no best time beside it, which is all it has to say about one.
        slug={id}
      />
      {/* Ten seconds of play, once per tab session. A world somebody
          published is not a registry slug and is ignored here — it has its
          own counter. See the component. */}
      <CountPlay slug={id} />
    </>
  );
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
