import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { deleteAccountData } from "@/lib/db/account";

/**
 * DELETE /api/account — delete the signed-in account and everything it owns.
 *
 * Before this existed, deleting an account through Clerk's own menu removed
 * the sign-in and left the times, coins and worlds in Neon, which is the
 * opposite of what `/privacy` promises and of what Play's account-deletion
 * policy requires. There is no Clerk webhook here to catch it after the fact,
 * so this is the path that does both halves.
 *
 * The database goes FIRST. If the Clerk call then fails, the person can still
 * sign in and press the button again, and the database half is idempotent.
 * The other order strands their data behind an account that no longer exists,
 * with no way left for them to reach it.
 */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await deleteAccountData(userId);

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch {
    return NextResponse.json(
      { error: "Your data was deleted but the sign-in was not. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ deleted: true, worlds: removed.worlds });
}
