import { StatBlock } from "@/components/hud/StatBlock";
import { PageShell, PageHeader } from "@/components/PageShell";
import { CabinetPreview } from "@/components/arcade/CabinetPreview";

/**
 * Every chrome primitive, on one page.
 *
 * ── Why a route and not Storybook ────────────────────────────────────────
 *
 * Storybook is a second build, a second dependency tree and a second place for
 * a component to be configured differently from the way the app configures it.
 * This is a page in the app: it renders inside the real layout, with the real
 * fonts, the real tokens and the real cascade, so a variant that looks right
 * here looks right in the product by construction.
 *
 * ── What it is for ───────────────────────────────────────────────────────
 *
 * Two things, both of which were previously done by opening four screens and
 * comparing them from memory:
 *
 *  1. Seeing the whole set at once is the only way to notice drift. The same
 *     kind of HUD panel had shipped as `px-3 py-2`, `px-3.5 py-2` and
 *     `px-3 py-1.5` — invisible on any one screen, obvious in a column.
 *  2. Every accent at once. The mode accents are rebound by `data-mode`, so a
 *     component that hardcodes a colour instead of using the token looks
 *     correct in the mode it was built in and wrong in the other two. Here all
 *     three are side by side and it cannot hide.
 *
 * Not linked from anywhere. It is a tool, and a nav slot for a tool is a nav
 * slot spent on something no player wants.
 */
export const metadata = {
  title: "Kit — Spec Driven Games",
  // A dev tool has no business in search results.
  robots: { index: false, follow: false },
};

const MODES = ["build", "race", "parkour"] as const;

export default function KitPage() {
  return (
    <PageShell footer={false}>
      <PageHeader title="Kit">
        <p className="text-dim text-sm">
          Every chrome primitive, in all three mode accents. Not linked from
          anywhere — see the note in this file.
        </p>
      </PageHeader>

      <Section title="Buttons">
        {MODES.map((mode) => (
          <div key={mode} data-mode={mode} className="flex flex-wrap items-center gap-2">
            <span className="hud-label w-16">{mode}</span>
            <button className="hud-chip hud-chip--primary">Primary</button>
            <button className="hud-chip">Secondary</button>
            <button className="hud-chip is-active">Armed</button>
            <button className="hud-chip hud-chip--danger">Danger</button>
            <button className="hud-chip" disabled>
              Disabled
            </button>
            <button className="hud-chip hud-chip--primary chamfer-sm">
              Chamfered
            </button>
          </div>
        ))}
      </Section>

      <Section title="Surfaces">
        <div className="flex flex-wrap gap-3">
          <Swatch label="card">
            <div className="card panel-lit h-20 w-40" />
          </Swatch>
          <Swatch label="card · chamfer">
            <div className="card chamfer panel-lit h-20 w-40" />
          </Swatch>
          <Swatch label="chamfer-edge">
            <div className="chamfer chamfer-edge h-20 w-40">
              <div className="chamfer bg-panel h-full w-full" />
            </div>
          </Swatch>
          <Swatch label="chamfer-edge · accent">
            <div
              data-mode="race"
              className="chamfer chamfer-edge chamfer-edge--accent h-20 w-40"
            >
              <div className="chamfer bg-panel h-full w-full" />
            </div>
          </Swatch>
          <Swatch label="brackets">
            <div data-mode="parkour" className="card brackets h-20 w-40" />
          </Swatch>
          <Swatch label="grain">
            <div className="card grain h-20 w-40" />
          </Swatch>
        </div>
      </Section>

      <Section title="Readouts">
        <div className="flex flex-wrap gap-6">
          <StatBlock label="Speed" value="184" unit="kph" />
          <StatBlock label="Lap" value="2" suffix="/3" align="center" />
          <StatBlock label="Coins" value="1,194" accent size="lg" />
          <StatBlock label="Best" value="0:28.38" size="sm" align="end" />
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <span className="text-display font-bold">Display</span>
          <h2 className="text-xl font-bold">Heading</h2>
          <p className="text-dim text-sm">
            Body copy, IBM Plex Sans, capped at a readable measure by the rule
            in globals.css.
          </p>
          <span className="hud-label">Label · tracked · uppercase</span>
          <span className="num">0123456789 tabular</span>
        </div>
      </Section>

      <Section title="Cabinet previews">
        <div className="flex flex-wrap gap-3">
          {["chunk-runner", "tower-stack", "unknown"].map((id) => (
            <Swatch key={id} label={id}>
              <div className="card relative h-20 w-48 overflow-hidden">
                <CabinetPreview id={id} />
              </div>
            </Swatch>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="hud-label mb-3">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {children}
      <span className="hud-label">{label}</span>
    </div>
  );
}
