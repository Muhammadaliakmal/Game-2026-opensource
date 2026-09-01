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
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center">
        {/* Ambient wash so the void isn't flat black behind the hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--color-plasma) 0%, transparent 65%)",
          }}
        />
        <div className="relative flex flex-col items-center gap-5">
          <span className="hud-label text-neon">Build · Play · Remix</span>
          <h1 className="max-w-2xl text-5xl font-black tracking-tight sm:text-6xl">
            Build worlds out of{" "}
            <span className="from-neon to-plasma bg-gradient-to-r bg-clip-text text-transparent">
              blocks
            </span>
            , then walk around inside them.
          </h1>
          <p className="text-muted max-w-md text-sm">
            A voxel editor and a platformer in the same browser tab. Place a
            block, hit play, and you&apos;re standing on it.
          </p>
          <Show when="signed-out">
            <SignInButton>
              <button className="hud-chip hud-chip--neon mt-2 !px-7 !py-3.5 !text-xs">
                Start building
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>
    );
  }

  const myWorlds = await db
    .select()
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="hud-label text-neon">Your worlds</span>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {myWorlds.length === 0
              ? "Nothing here yet"
              : `${myWorlds.length} world${myWorlds.length === 1 ? "" : "s"}`}
          </h1>
        </div>
        <NewWorldButton />
      </div>

      {myWorlds.length === 0 ? (
        <div className="border-line text-muted rounded-2xl border border-dashed p-12 text-center text-sm">
          Hit <span className="text-neon font-semibold">New World</span> and
          start placing blocks.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myWorlds.map((w) => (
            <li
              key={w.id}
              className="hud-panel group hover:border-neon/60 relative overflow-hidden p-4 transition-colors"
            >
              {/* Accent edge that lights up on hover — cheap way to make a
                  list of cards feel like a game menu rather than a table. */}
              <span
                aria-hidden
                className="from-neon to-plasma absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100"
              />
              <h2 className="truncate font-bold">{w.name}</h2>
              <p className="hud-label mt-1.5">
                {w.doc.parts.length.toLocaleString()} parts ·{" "}
                {new Date(w.updatedAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex gap-2">
                <Link href={`/build/${w.id}`} className="hud-chip">
                  Build
                </Link>
                <Link
                  href={`/play/${w.id}`}
                  className="hud-chip hud-chip--mint"
                >
                  ▶ Play
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
