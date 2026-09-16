import "dotenv/config";
import { defineRoom, defineServer, listen } from "colyseus";
import { BuildRoom } from "./rooms/BuildRoom.ts";
import { RaceRoom } from "./rooms/RaceRoom.ts";
import { appWorldSource, setWorldSource } from "./world-source.ts";
import { appRewardSink, setRewardSink } from "./rewards.ts";

/**
 * The room server: a separate Node process from the Next app, because a
 * WebSocket room has to stay resident and Vercel's functions do not.
 *
 * It holds no database credentials of its own — worlds are read through the
 * app's API (see world-source.ts), which already knows who may read what.
 */
const PORT = Number(process.env.PORT ?? 2567);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
/**
 * The credential the app knows this process by. Without it a room can still
 * read public worlds and run a session, but it cannot open a private world and
 * cannot save anything — so a deployment missing it is worth saying out loud
 * rather than discovering when a session ends.
 */
const MULTIPLAYER_SECRET = process.env.MULTIPLAYER_SECRET;

setWorldSource(appWorldSource(APP_URL, MULTIPLAYER_SECRET));
// Race places and duel results are paid through the app too, with the same
// secret — see rewards.ts. Without it, matches are simply unpaid.
setRewardSink(appRewardSink(APP_URL, MULTIPLAYER_SECRET));

if (!MULTIPLAYER_SECRET) {
  console.warn(
    "[blockworld] MULTIPLAYER_SECRET is not set — private worlds cannot be opened " +
      "and no edit will ever be saved. Set it here and in the app."
  );
}
if (!process.env.CLERK_SECRET_KEY && process.env.ALLOW_ANONYMOUS_ROOMS !== "1") {
  console.warn(
    "[blockworld] CLERK_SECRET_KEY is not set — every join will be refused. " +
      "Set it, or ALLOW_ANONYMOUS_ROOMS=1 for local development."
  );
}

// filterBy worldId is what makes two people editing the same world land in the
// SAME room. Without it, joinOrCreate hands the second client a fresh room and
// the two of them build in perfect isolation, wondering why.
const server = defineServer({
  rooms: {
    build: defineRoom(BuildRoom).filterBy(["worldId"]),
    // Races are found by their code, not by a world: two people share a link
    // to their own race, it never collides with anyone else's, and the track
    // is fixed, so there is no world to filter on.
    race: defineRoom(RaceRoom).filterBy(["code"]),
  },
});

listen(server, PORT).then(() => {
  console.log(`[blockworld] room server on :${PORT}, worlds from ${APP_URL}`);
});
