"use client";

import dynamic from "next/dynamic";

/** Browser-only mount, as every canvas in the app: R3F cannot be SSR'd. */
const SurfacesCanvas = dynamic(() => import("./SurfacesCanvas"), { ssr: false });

export function SurfacesMount() {
  return <SurfacesCanvas />;
}
