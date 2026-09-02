import { notFound } from "next/navigation";
import { ArenaMount } from "@/components/arena/ArenaMount";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";

/**
 * A match by code. `?world=` only matters for whoever opens it — anyone
 * following the link inherits the world the match was created with, which is
 * why the room ignores the second client's choice.
 */
export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ world?: string }>;
}) {
  const { code } = await params;
  const { world } = await searchParams;
  if (!isMatchCode(code)) notFound();

  return (
    <ArenaMount code={normalizeMatchCode(code)} worldId={world ?? "parkour"} />
  );
}
