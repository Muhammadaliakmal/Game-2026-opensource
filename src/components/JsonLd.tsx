/**
 * A block of schema.org JSON-LD.
 *
 * ── Why `dangerouslySetInnerHTML` is the correct tool here ───────────────
 *
 * A `<script type="application/ld+json">` has to contain raw JSON text.
 * React escapes children of a `<script>` into HTML entities, which produces a
 * script body that is valid HTML and invalid JSON — the tag renders, the
 * crawler fetches it, and the structured data is silently ignored. Setting
 * the inner HTML is the documented way round it.
 *
 * What makes it safe rather than dangerous is that nothing here is user
 * input: every caller passes an object literal built from constants and from
 * `content/`, which is checked into the repository. `</script>` is escaped
 * anyway, because "no caller will ever pass a string containing that" is the
 * kind of assumption that is true until somebody writes a blog post about
 * script tags.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
