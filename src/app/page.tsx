export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Blockworld
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        A Roblox-style UGC 3D world builder. Scaffold in progress — the world
        browser and editor land in later phases.
      </p>
    </div>
  );
}
