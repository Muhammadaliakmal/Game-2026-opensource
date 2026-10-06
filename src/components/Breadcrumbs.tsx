import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { SITE_URL } from "@/lib/site";

export interface Crumb {
  readonly href: string;
  readonly label: string;
}

/**
 * Where this page sits, said twice: once for a reader and once for a crawler.
 *
 * The visible trail is the useful half — a guide page reached from a search
 * result is a page somebody landed on with no idea what the rest of the site
 * is, and a dead end is one of the things a content review looks for.
 *
 * The `BreadcrumbList` beside it is what turns a bare URL in a search result
 * into a path, and it has to agree with the visible trail exactly or it is a
 * structured-data warning rather than a feature. Both come from the same
 * array here, so they cannot disagree.
 *
 * The last crumb is the current page: rendered as text rather than a link,
 * because a link to the page you are on is a link nobody wants and a
 * `BreadcrumbList` item that points at itself is still correct — the schema
 * expects the final item to name the current page.
 */
export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4" data-web-only>
      <ol className="text-dim flex flex-wrap items-center gap-1.5 text-xs">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {last ? (
                <span className="text-ink" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="hover:text-ink underline">
                  {crumb.label}
                </Link>
              )}
              {!last && <span aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: trail.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.label,
            item: `${SITE_URL}${crumb.href === "/" ? "" : crumb.href}`,
          })),
        }}
      />
    </nav>
  );
}
