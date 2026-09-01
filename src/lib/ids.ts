/**
 * `worlds.id` is a Postgres `uuid` column, so handing it a string that isn't a
 * uuid is a query error (22P02), not an empty result — which surfaced as a 500
 * on any mistyped or stale link (`/play/foo`). Every route that looks a world
 * up by id guards with this first and answers 404 instead.
 *
 * Built-in slugs ("parkour", "garden") are deliberately NOT uuids; check
 * `isBuiltInWorld` before this, never instead of it.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: string): boolean => UUID_RE.test(s);
