"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, type Shape } from "@/lib/worlddoc";

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
        case "p":
          s.setTool(s.tool === "prop" ? "place" : "prop");
          return;
        // X marks the finish. Not F, which `FrameWorld` owns on its own window
        // listener — binding it here too would frame the world *and* switch
        // tool on every press, and neither handler would know why.
        case "x":
          s.setTool(s.tool === "goal" ? "place" : "goal");
          return;
        case "c":
          s.setTool(s.tool === "checkpoint" ? "place" : "checkpoint");
          return;
        case "delete":
        case "backspace":
          // Guarded by tool, not just "is something selected" — Backspace is
          // too common a key to hijack outside the one mode props use it in.
          if (s.tool === "prop") s.deleteSelectedProp();
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

    /**
     * Shift + wheel walks the palette — the hotbar scroll every block game
     * has.
     *
     * Shifted rather than plain, because a plain wheel is the camera's zoom
     * and taking that away to save a keystroke would be a poor trade. It is
     * `passive: false` and preventDefault'd so the zoom does not also happen:
     * a listener that cycles the colour AND zooms out is worse than neither.
     */
    function onWheel(e: WheelEvent) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useEditorStore.getState();
      if (s.readOnly) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? 1 : -1;
      const next = (s.colorIndex + step + PALETTE.length) % PALETTE.length;
      s.setColorIndex(next);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [onSave]);
}
