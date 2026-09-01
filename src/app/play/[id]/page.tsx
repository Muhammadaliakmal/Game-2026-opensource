import { PlayMount } from "@/components/play/PlayMount";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Browser-only R3F mount lives in PlayMount — see the note there.
  return <PlayMount worldId={id} />;
}
