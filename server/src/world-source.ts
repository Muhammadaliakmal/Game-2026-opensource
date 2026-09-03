import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";
import { SERVICE_SECRET_HEADER } from "@/lib/service-auth";

/**
 * A world, plus the two facts a room needs to police it.
 *
 * The document alone is not enough: a room has to answer "may this person edit
 * it" and "may this person even see it", and neither question is answerable
 * from parts and props. `ownerId` is null for a world nobody owns — a built-in
 * — which is the same as saying nobody may edit it.
 */
export interface WorldRecord {
  doc: WorldDoc;
  ownerId: string | null;
  published: boolean;
  builtIn: boolean;
}

/**
 * Where a room gets its world from, and where it puts it back. An interface
 * rather than a direct database call so the room can be tested against a world
 * held in memory, and so the Neon credentials stay in exactly one place — the
 * Next app.
 */
export interface WorldSource {
  load(worldId: string): Promise<WorldRecord | null>;
  /** Rejects if the write did not happen; the caller retries. */
  save(worldId: string, doc: WorldDoc): Promise<void>;
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
export function memoryWorldSource(
  records: Record<string, WorldRecord>
): WorldSource & { saved: Record<string, WorldDoc> } {
  const saved: Record<string, WorldDoc> = {};
  return {
    saved,
    async load(worldId) {
      return records[worldId] ?? null;
    },
    async save(worldId, doc) {
      saved[worldId] = doc;
      const record = records[worldId];
      if (record) record.doc = doc;
    },
  };
}

/**
 * Reads and writes through the app.
 *
 * With a shared secret it uses `/api/worlds/:id/sync`, which answers for
 * private worlds too and is the only route that will take a write. Without
 * one it falls back to the public `GET /api/worlds/:id` — enough to run a room
 * against `next dev` with no secret configured, and read-only by construction:
 * there is no public route that would save a world for you.
 */
export function appWorldSource(baseUrl: string, secret?: string): WorldSource {
  const headers = secret ? { [SERVICE_SECRET_HEADER]: secret } : undefined;
  const world = (worldId: string) => `${baseUrl}/api/worlds/${encodeURIComponent(worldId)}`;

  return {
    async load(worldId) {
      const url = headers ? `${world(worldId)}/sync` : world(worldId);
      const res = await fetch(url, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`world fetch failed: ${res.status}`);

      const body = (await res.json()) as {
        doc?: unknown;
        ownerId?: string | null;
        published?: boolean | number;
        builtIn?: boolean;
      };

      // Parse rather than cast: the app is a separate deployment that can be a
      // version ahead, and a malformed doc should fail here, loudly, instead of
      // becoming a room full of edits nobody can save.
      const doc = parseWorldDoc(body.doc);
      const builtIn = Boolean(body.builtIn);

      return {
        doc,
        // A built-in has no owner however the route phrased it — the public
        // route fills the field in with whoever asked, which is a courtesy to
        // the editor and would be a licence to edit if believed here.
        ownerId: builtIn ? null : (body.ownerId ?? null),
        published: builtIn || body.published === true || body.published === 1,
        builtIn,
      };
    },

    async save(worldId, doc) {
      if (!headers) {
        throw new Error("cannot save without MULTIPLAYER_SECRET — the room is read-only");
      }
      const res = await fetch(`${world(worldId)}/sync`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      if (!res.ok) throw new Error(`world save failed: ${res.status}`);
    },
  };
}
