"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor-store";
import type { Shape } from "@/lib/worlddoc";

/**
 * Keyboard shortcuts. Lives outside the Canvas because it binds to window —
 * R3F's event system only sees pointer events inside the GL surface.
 */
export function useEditorHotkeys(onSave?: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never hijack keys while the user is naming their world.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      const s = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        // Ctrl+Shift+Z is the other common redo binding, alongside Ctrl+Y.
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.();
        return;
      }

      switch (e.key.toLowerCase()) {
        case "r":
          s.rotateBrush();
          break;
        case "e":
          s.setTool(s.tool === "erase" ? "place" : "erase");
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          s.setShape((Number(e.key) - 1) as Shape);
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);
}
