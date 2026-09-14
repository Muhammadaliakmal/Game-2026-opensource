import { PageShell, PageHeader } from "@/components/PageShell";
import { SurfacesMount } from "@/components/dev/SurfacesMount";
import { TEXTURES } from "@/lib/texture-list";

/**
 * Every block surface under every finish, on one canvas. The tuning tool for
 * lib/textures/tuning.ts and scripts/build-textures.ts — a change to either
 * is judged here, across the whole set at once, not on whichever block
 * happened to be in front of the camera. Same reasoning as /dev/kit: a route
 * in the real app rather than a second build. Not linked from anywhere.
 */
export const metadata = {
  title: "Surfaces — Blockworld",
  robots: { index: false, follow: false },
};

export default function SurfacesPage() {
  return (
    <PageShell footer={false}>
      <PageHeader title="Surfaces">
        <p className="text-dim text-sm">
          Rows: {TEXTURES.map((t) => t.label).join(", ")}. Columns: matte,
          glossy, metal, emissive, each in grey, green and blue; then a slab, a
          ramp and a wedge. Drag to orbit.
        </p>
      </PageHeader>
      <SurfacesMount />
    </PageShell>
  );
}
