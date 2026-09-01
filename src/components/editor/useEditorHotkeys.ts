"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor-store";
import type { Shape } from "@/lib/worlddoc";

/**
 * Keyboard shortcuts. Lives outside the Canvas because it binds to window —
 * R3F's event system only sees pointer events inside the GL surface.
 */
export function useEditorHotkeys(onSave?: () => void | Promise<boolean>) {
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
        void onSave?.();
        return;
      }

      // Tools: B/E/G/I follow the Minecraft and Blender muscle memory the UI
      // spec asks for, rather than inventing a scheme. S is the spawn flag
      // (Ctrl+S is save, plain S is free).
      switch (e.key.toLowerCase()) {
        case "r":
          s.rotateBrush();
          return;
        case "b":
          s.setTool("place");
          return;
        case "e":
          s.setTool(s.tool === "erase" ? "place" : "erase");
          return;
        case "g":
          s.setTool(s.tool === "paint" ? "place" : "paint");
          return;
        case "i":
          s.setTool(s.tool === "pick" ? "place" : "pick");
          return;
        case "s":
          s.setTool(s.tool === "spawn" ? "place" : "spawn");
          return;
      }

      // Digits pick a palette colour (1-9 = the first nine swatches), and
      // Shift+digit picks a shape. Read from e.code, because Shift+1 arrives
      // as "!" in e.key.
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        if (e.shiftKey) {
          if (n <= 4) s.setShape((n - 1) as Shape);
        } else {
          s.setColorIndex(n - 1);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);
}
