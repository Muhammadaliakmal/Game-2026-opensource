import type { Metadata } from "next";
import { PageShell, PageHeader } from "@/components/PageShell";
import { CONTACT_EMAIL, OWNER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * How to reach a person.
 *
 * ── The form is conditional, and that is the whole design ────────────────
 *
 * A contact form that posts to a placeholder endpoint is worse than no form:
 * it swallows every message with a cheerful redirect, and the sender has no
 * way to know. That failure is invisible from the outside, which is exactly
 * why it is a common reason an ad review fails — the reviewer writes, hears
 * nothing, and concludes there is nobody behind the site.
 *
 * So the form renders only when `NEXT_PUBLIC_FORMSPREE_ID` is set to a real
 * form. Without it the page is an email address, which always works. There is
 * no state in which this page pretends to send something it cannot send.
 *
 * ── No client JavaScript ─────────────────────────────────────────────────
 *
 * A plain `<form action method="POST">` to Formspree's endpoint. Formspree
 * handles the submit and the thank-you page, so this stays a Server Component
 * and works with JS disabled — which is the state a crawler is usually in.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Contact · ${SITE_NAME}`,
  description: `Get in touch with ${OWNER_NAME} about ${SITE_NAME} — bug reports, feedback, or anything else.`,
  alternates: { canonical: `${SITE_URL}/contact` },
};

/**
 * The form id, or nothing.
 *
 * Read at module scope because `NEXT_PUBLIC_` variables are inlined at build
 * time: this is a constant in the bundle, not a lookup.
 */
const FORM_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID;

export default function ContactPage() {
  return (
    <PageShell width="prose">
      <PageHeader title="Contact">
        <p className="text-dim text-sm">
          Bug reports, feedback on a course, or anything else — send it here
          and I&apos;ll read it.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-8">
        {FORM_ID ? (
          <form
            action={`https://formspree.io/f/${FORM_ID}`}
            method="POST"
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="hud-label">Your email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-md border border-[var(--border-color)] bg-transparent p-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="hud-label">Your message</span>
              <textarea
                name="message"
                required
                rows={6}
                placeholder="What happened, and where?"
                className="w-full rounded-md border border-[var(--border-color)] bg-transparent p-3 text-sm"
              />
            </label>

            <button type="submit" className="hud-chip hud-chip--primary w-fit">
              Send
            </button>
          </form>
        ) : (
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-ink text-sm font-semibold">Email</h2>
            <p className="text-dim text-sm leading-relaxed">
              The quickest way to reach me is straight to my inbox:
            </p>
            <a
              className="text-accent text-sm underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
          </section>
        )}

        {FORM_ID && (
          <p className="text-dim text-sm">
            Or email directly:{" "}
            <a
              className="text-accent underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-ink text-lg font-bold">What helps</h2>
          <div className="text-dim flex flex-col gap-2 text-sm leading-relaxed">
            <p>
              For a bug, the three things that make it findable are which
              screen you were on, what device and browser you were using, and
              what you expected to happen instead. A course name and a
              screenshot beat a long description.
            </p>
            <p>
              I read everything. I do not always reply quickly — this is one
              person, not a support desk.
            </p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
