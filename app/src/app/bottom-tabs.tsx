"use client";

// Fixed bottom tab bar for mobile (< 860px); hidden on desktop, where the tabs
// live in the header instead (design handoff §2). Active tab = accent.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/browse", label: "Browse", icon: "▤" },
  { href: "/ask", label: "Ask", icon: "◍" },
  { href: "/staleness", label: "Report", icon: "◷" },
];

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-bd bg-hdr desk:hidden">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              active ? "text-acc" : "text-tx2"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
