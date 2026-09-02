"use client";

import { useEditorStore } from "@/stores/editor-store";
import { PROP_CATALOG } from "@/lib/props-catalog";

/**
 * The prop tool's equivalent of the palette strip: pick a catalog entry, then
 * click in the world to place it (Builder.tsx routes that click through
 * `placeProp`). SPEC §12 Phase 3's "in-editor prop browser (thumbnails)".
 */
export function PropBrowser() {
  const activePropId = useEditorStore((s) => s.activePropId);

  if (PROP_CATALOG.length === 0) {
    return (
      <div className="hud-panel pointer-events-auto max-w-[min(92vw,32rem)] p-2 text-2xs text-steel-200">
        No props in the catalog yet — run the pipeline in scripts/.
      </div>
    );
  }

  return (
    <div className="hud-panel hud-scroll pointer-events-auto flex max-w-[min(92vw,32rem)] flex-nowrap gap-1 overflow-x-auto p-1.5">
      {PROP_CATALOG.map((prop) => (
        <button
          key={prop.id}
          onClick={() => useEditorStore.getState().setActivePropId(prop.id)}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius)] border border-black/35 transition-transform hover:-translate-y-0.5 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-[var(--color-signal)]"
          aria-label={prop.name}
          aria-pressed={activePropId === prop.id}
          title={prop.name}
        >
          {/* Plain img, not next/image: these are already fixed-size 256px
              thumbnails, and a next/image src can later point at the R2
              public domain, which would need remotePatterns config to avoid
              a runtime error. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={prop.thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
