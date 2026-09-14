import type { Metadata } from "next";
import { apkInfo, formatBytes, APK_PATH } from "@/lib/apk";
import { PageShell, PageHeader } from "@/components/PageShell";
import { InstallPanel } from "./InstallPanel";

export const metadata: Metadata = {
  title: "Get Spec Driven Games",
  description:
    "Install Spec Driven Games on Android, iOS or desktop — as a home-screen app or a downloadable APK.",
};

/**
 * The install page.
 *
 * A Server Component so the APK's real size and build date come from the file
 * on disk rather than from a constant somebody has to remember to update. The
 * device-dependent half is a client island — see InstallPanel.
 *
 * `force-dynamic` because the answer depends on a file that is dropped in
 * between deploys: statically rendered at build time, this page would keep
 * claiming there is no APK long after one was added.
 */
export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const apk = await apkInfo();

  return (
    // `prose` caps the CONTENT rather than the container, so the back-link and
    // the heading start at the same x as every other route. That 106px
    // discrepancy — content visibly sliding sideways on navigation — was the
    // whole of bug #20; see components/PageShell.
    <PageShell width="prose">
      <PageHeader title="Get Spec Driven Games">
          <p className="text-dim text-sm">
            Spec Driven Games runs in a browser, so there is nothing you have to
            install. Installing it anyway gets you a home-screen icon, a
            fullscreen window with no address bar over the HUD, and a game that
            opens in one tap instead of a URL.
          </p>
      </PageHeader>

        <InstallPanel apkAvailable={apk.available} apkPath={APK_PATH} />

        {apk.available && (
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-ink text-sm font-semibold">This build</h2>
            <dl className="text-dim grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt>Version</dt>
              <dd className="num text-ink">{apk.version}</dd>
              <dt>Size</dt>
              <dd className="num text-ink">{formatBytes(apk.size)}</dd>
              <dt>Built</dt>
              <dd className="num text-ink">
                {apk.built ? apk.built.slice(0, 10) : "—"}
              </dd>
            </dl>
          </section>
        )}

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-ink text-sm font-semibold">
            What you need either way
          </h2>
          <ul className="text-dim flex flex-col gap-1.5 text-xs">
            <li>
              A connection. Worlds live on the server and races run through a
              room, so none of it works offline.
            </li>
            <li>
              WebGL2, which every phone made in the last several years has.
            </li>
            <li>
              Landscape, on a phone. The race HUD puts the running order and the
              touch controls in the corners, and portrait stacks them over the
              track.
            </li>
          </ul>
        </section>
    </PageShell>
  );
}
