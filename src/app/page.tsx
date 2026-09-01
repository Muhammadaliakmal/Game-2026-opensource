import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, Show } from "@clerk/nextjs";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { NewWorldButton } from "@/components/NewWorldButton";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Blockworld</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Build worlds out of blocks, then walk around inside them.
        </p>
        <Show when="signed-out">
          <SignInButton>
            <button className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500">
              Sign in to start building
            </button>
          </SignInButton>
        </Show>
      </div>
    );
  }

  const myWorlds = await db
    .select()
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your worlds</h1>
          <p className="text-sm text-zinc-500">
            {myWorlds.length === 0
              ? "Nothing here yet — make your first one."
              : `${myWorlds.length} world${myWorlds.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <NewWorldButton />
      </div>

      {myWorlds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Hit “New World” and start placing blocks.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myWorlds.map((w) => (
            <li
              key={w.id}
              className="rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="truncate font-medium">{w.name}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {w.doc.parts.length.toLocaleString()} parts · updated{" "}
                {new Date(w.updatedAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/build/${w.id}`}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
                >
                  Build
                </Link>
                <Link
                  href={`/play/${w.id}`}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500"
                >
                  Play
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
