// Browse the coursework tree. Optional catch-all: /vault/browse shows the data
// root; /vault/browse/<course>/<sub> shows a nested folder. Gated by the proxy,
// so only an authenticated user reaches it. listDirectory validates the path.
import { notFound } from "next/navigation";
import Link from "next/link";
import { listDirectory } from "@/lib/browse/catalog";
import { BrowseList } from "./browse-list";
import { ResumeCard } from "./resume-card";

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  // Page catch-all params arrive URL-ENCODED in Next 16 (unlike route-handler
  // params, which are decoded), so "Course%20A" must be decoded to "Course A"
  // before hitting the filesystem. decodeURIComponent throws on malformed input
  // (e.g. a lone "%"), which we treat as not-found. The traversal guard still
  // runs afterwards on the decoded value, so an encoded ".." can't sneak through.
  const segments = decodeSegments(path ?? []);
  if (segments === null) notFound();

  const listing = await listDirectory(segments);
  if (listing === null) notFound();

  return (
    <main className="mx-auto w-full max-w-[1020px] px-5 py-6">
      <Breadcrumbs segments={segments} />
      {/* Resume card only at the browse root, above the course list. */}
      {segments.length === 0 && (
        <div className="mb-4">
          <ResumeCard />
        </div>
      )}
      <BrowseList segments={segments} entries={listing.entries} />
    </main>
  );
}

/** Decode each URL-encoded segment; returns null if any segment is malformed. */
function decodeSegments(raw: string[]): string[] | null {
  try {
    return raw.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

/** Clickable path trail. Each crumb links to that folder; the last is inert. */
function Breadcrumbs({ segments }: { segments: string[] }) {
  const crumbs = [{ name: "Browse", href: "/browse" }];
  let acc = "";
  for (const segment of segments) {
    acc += "/" + encodeURIComponent(segment);
    crumbs.push({ name: segment, href: "/browse" + acc });
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-[13px]">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href}>
            {i > 0 && <span className="mx-1 text-mut">/</span>}
            {isLast ? (
              <span className="font-semibold text-tx2">{crumb.name}</span>
            ) : (
              <Link href={crumb.href} className="text-acc hover:underline">
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
