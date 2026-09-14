import { GamesHub } from "@/components/modes/GamesHub";
import { PageShell, PageHeader } from "@/components/PageShell";
import { PrefetchCanvas } from "@/components/PrefetchCanvas";

/**
 * Everything you can play, at one address.
 *
 * The home page carries the same hub, but the home page is also the pitch,
 * the gallery and — signed in — your own worlds. "Games" in the header needs
 * to land on the games and nothing else, which is this.
 */
export const metadata = {
  title: "Games — Spec Driven Games",
  description:
    "Parkour, racing, arena duels, and four arcade cabinets. Every game on the site, one press from playing.",
};

export default function GamesPage() {
  return (
    <PageShell>
      <PageHeader title="Games">
        <p className="text-dim max-w-xl text-sm">
          Everything here, one press from playing. No account needed to start.
        </p>
      </PageHeader>
      <GamesHub heading="Modes" />
      <PrefetchCanvas kind="world" />
    </PageShell>
  );
}
