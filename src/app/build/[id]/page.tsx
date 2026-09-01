import { WorldMount } from "@/components/world/WorldMount";

export default async function BuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Build and Play are one canvas with a mode (see WorldCanvas); the route
  // only decides which mode it opens in, and switching does not navigate.
  return <WorldMount worldId={id} initialMode="build" />;
}
