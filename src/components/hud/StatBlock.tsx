import type { ReactNode } from "react";

/**
 * A label and the number under it.
 *
 * ── Why this is a component and not three utility classes ────────────────
 *
 * It already existed six times — in the race HUD's lap/pos panel, in both
 * gauges, on the arcade cards, on the course cards — written slightly
 * differently each time: `gap-0.5` here and `gap-1` there, the label above the
 * value in one place and beside it in another, `text-lg` and `text-xl` for the
 * same role. None of that is visible as a bug on any one screen. It is visible
 * as the app not quite feeling like one product, which is the thing a design
 * system exists to stop.
 *
 * ── The rule it encodes ──────────────────────────────────────────────────
 *
 * The label is small, tracked out and dim; the value is large, mono and
 * tabular. That ordering is deliberate and is the opposite of what a form
 * does: on a readout the number is the thing being read and the label only has
 * to be findable, so the label gives up contrast to the value rather than
 * competing with it.
 *
 * Tabular figures are not optional. Without them the digits change width as
 * the value changes and a timer visibly jitters — which `.num` handles, and
 * which is why every value here goes through it.
 */
export function StatBlock({
  label,
  value,
  unit,
  /** A secondary value in the same cell — "/3" on a lap counter, "total" on a wallet. */
  suffix,
  accent = false,
  align = "start",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  suffix?: ReactNode;
  /** Draw the value in the mode's accent. At most one per panel. */
  accent?: boolean;
  align?: "start" | "center" | "end";
  size?: "sm" | "md" | "lg";
}) {
  const valueSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <div
      className={`flex flex-col gap-0.5 ${
        align === "center"
          ? "items-center"
          : align === "end"
            ? "items-end"
            : "items-start"
      }`}
    >
      <span className="hud-label">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={`hud-readout ${valueSize} ${accent ? "text-accent" : ""}`}
        >
          {value}
        </span>
        {suffix && <span className="text-dim text-2xs">{suffix}</span>}
        {unit && <span className="hud-label">{unit}</span>}
      </span>
    </div>
  );
}
