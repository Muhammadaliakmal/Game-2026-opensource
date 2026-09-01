import { EditorMount } from "@/components/editor/EditorMount";

export default async function BuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The canvas is mounted browser-only inside EditorMount — see the note there
  // on why the dynamic import can't live in this Server Component.
  return <EditorMount worldId={id} />;
}
