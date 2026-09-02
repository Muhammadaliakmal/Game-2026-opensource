import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";

/**
 * Where a room gets its world from. An interface rather than a direct database
 * call so the room can be tested against a world held in memory, and so the
 * Neon credentials stay in exactly one place — the Next app.
 */
export interface WorldSource {
  load(worldId: string): Promise<WorldDoc | null>;
}

/**
 * The source every room reads through, set once at startup (and swapped in
 * tests). Deliberately NOT passed in through room options: those come from the
 * joining client, and a client that can name its own world source can serve
 * itself any world it likes.
 */
let current: WorldSource | null = null;

export function setWorldSource(source: WorldSource) {
  current = source;
}

export function getWorldSource(): WorldSource {
  if (!current) throw new Error("no WorldSource configured — call setWorldSource() at startup");
  return current;
}

/** For tests, and for running a room against a fixture with no app at all. */
export function memoryWorldSource(docs: Record<string, WorldDoc>): WorldSource {
  return {
    async load(worldId) {
      return docs[worldId] ?? null;
    },
  };
}

/**
 * Reads through the app's own `GET /api/worlds/:id`.
 *
 * That route already answers for built-in and published worlds without a
 * session, which is enough to run a room locally against `next dev` today.
 * Private worlds need a credential the room server does not have yet — that
 * arrives with the auth work in 5d, and until then loading one fails cleanly
 * rather than pretending the world is empty.
 */
export function httpWorldSource(baseUrl: string): WorldSource {
  return {
    async load(worldId) {
      const res = await fetch(`${baseUrl}/api/worlds/${encodeURIComponent(worldId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`world fetch failed: ${res.status}`);

      const body = (await res.json()) as { doc?: unknown };
      // Parse rather than cast: the app is a separate deployment that can be a
      // version ahead, and a malformed doc should fail here, loudly, instead of
      // becoming a room full of edits nobody can save.
      return parseWorldDoc(body.doc);
    },
  };
}
