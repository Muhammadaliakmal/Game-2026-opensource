import type { Metadata } from "next";
import { PageShell, PageHeader } from "@/components/PageShell";
import { SITE_NAME } from "@/lib/site";
import { DeleteAccount } from "./DeleteAccount";

/**
 * The account deletion page, and the URL the Play listing's "Delete account
 * URL" field points at. Play requires one for any app that lets people make
 * an account, reachable without installing the app — which is why it is a
 * page on the site and not a screen in the wrapper.
 *
 * `noindex`: an account screen is not an article (see `/shop` for the same
 * call), and a search result for "delete account" is not how anyone should
 * arrive at this.
 */
export const metadata: Metadata = {
  title: "Delete your account",
  description: `Delete your ${SITE_NAME} account and the data stored with it.`,
  robots: { index: false, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <PageShell width="prose">
      <PageHeader title="Delete your account">
        <p className="text-dim text-sm">
          This removes your {SITE_NAME} account and everything stored with it.
          It cannot be undone.
        </p>
      </PageHeader>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-ink text-sm font-semibold">What is deleted</h2>
        <ul className="text-dim flex list-disc flex-col gap-1.5 pl-4 text-xs">
          <li>Your sign-in, and the email address it is held under.</li>
          <li>Your course times, medals and ghosts, on every board.</li>
          <li>Your coins and the characters you own.</li>
          <li>
            The worlds you built, along with other players&apos; times on
            them.
          </li>
        </ul>
        <p className="text-dim text-xs">
          Nothing is kept afterwards. Settings saved in your own browser, such
          as sound, stay on your device until you clear its site data.
        </p>
      </section>

      <DeleteAccount />

      <p className="text-dim text-xs">
        Cannot sign in any more? Email{" "}
        <a className="text-accent underline" href="mailto:privacy@specdrivengames.com">
          privacy@specdrivengames.com
        </a>{" "}
        from the address on the account and it will be deleted by hand.
      </p>
    </PageShell>
  );
}
