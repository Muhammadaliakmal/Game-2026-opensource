import "dotenv/config";
import { createClerkClient } from "@clerk/backend";

/**
 * A real Clerk session token, for reaching a room the way a signed-in player
 * does.
 *
 * `plan-phase5.md` §5 carries a second unmeasured row beside the frame-rate
 * one: everything in Phase 5 was exercised as a guest or with
 * `ALLOW_ANONYMOUS_ROOMS=1`, so the path where a **genuine** Clerk session
 * token maps to a world's owner — and therefore to `canEdit` — has never
 * actually been run. It is the part of the auth chain that fails closed in the
 * worst way: a deployment where verification is subtly wrong looks perfect to
 * every guest and silently makes owners read-only in their own worlds, which
 * nobody reports as an auth bug.
 *
 * `verifyJoin` in src/auth.ts verifies a join token against
 * `CLERK_SECRET_KEY` and does not care where it came from — a browser session
 * and a Backend API mint are signed by the same instance. So this closes the
 * row without a browser, and against a deployed server rather than only
 * localhost.
 *
 * It lives here rather than in the app's `scripts/` for one blunt reason:
 * `@clerk/backend` is a real dependency of this package and only a transitive
 * one of the app, and `@clerk/nextjs/server` cannot be loaded by plain Node at
 * all. Token verification is a room concern; so is minting one to test it.
 *
 *   npm run token                     # list users, mint nothing
 *   npm run token -- --user user_123  # mint one for that user
 *   npm run token -- --user user_123 --revoke   # prove the mint path, keep nothing
 *
 * Then, from the repo root:
 *   npm run peers:soak -- --token "<the token>" --url wss://…
 *
 * ── Why minting is behind a flag ─────────────────────────────────────────
 *
 * `createSession` creates a REAL session on a REAL account in whichever Clerk
 * instance `CLERK_SECRET_KEY` belongs to. It appears in that user's active
 * sessions and it is a bearer credential until it is revoked. That is not
 * something a script should do because somebody ran it with no arguments, so
 * the default is a read-only listing and `--user` is the deliberate step.
 */

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set — see server/.env.example");

  const clerk = createClerkClient({ secretKey });
  const kind = secretKey.startsWith("sk_live") ? "PRODUCTION (sk_live)" : "development (sk_test)";
  const userId = arg("user");

  if (!userId) {
    const list = await clerk.users.getUserList({ limit: 10 });
    console.log(`Clerk instance: ${kind}`);
    console.log(`users: ${list.totalCount}\n`);
    for (const user of list.data) {
      console.log(`  ${user.id}  ${user.firstName ?? user.username ?? "(no name)"}`);
    }
    console.log(
      "\nNothing was created. To mint a room token:\n" +
        "  npm run token -- --user <id>\n" +
        "That creates a real session on that account; revoke it when the test is done."
    );
    return;
  }

  // A plain session token, no JWT template: `verifyJoin` reads `sub` for the
  // user id and prefers a name claim, falling back to one user lookup, so the
  // default token already carries everything a room asks for.
  const session = await clerk.sessions.createSession({ userId });
  const token = await clerk.sessions.getToken(session.id, "");

  if (process.argv.includes("--revoke")) {
    await clerk.sessions.revokeSession(session.id);
    console.error(`created and revoked ${session.id} — the mint path works, nothing is left behind`);
    console.log(token.jwt);
    return;
  }

  // Everything except the token goes to stderr, so stdout can be piped
  // straight into the soak harness.
  console.error(`Clerk instance: ${kind}`);
  console.error(`session ${session.id} for ${userId} — revoke it when you are done, from the`);
  console.error(`Clerk dashboard or by re-running with --revoke.`);
  console.log(token.jwt);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
