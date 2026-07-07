"use client";

// Sticky top header shared across the authenticated app (design handoff §2).
// Wordmark → Browse; on desktop (≥860px) the Browse/Ask tabs sit beside it with
// the active tab as a qbub pill. Theme toggle + Sign out on the right. The health
// pill is intentionally deferred. On mobile the tabs move to the bottom bar.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LogoutButton } from "./logout-button";

const TABS = [
  { href: "/browse", label: "Browse" },
  { href: "/ask", label: "Ask" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-bd bg-hdr">
      <div className="mx-auto flex h-14 max-w-[1020px] items-center gap-3 px-5">
        <Link href="/browse" className="font-serif text-[17px] font-bold tracking-tight text-tx">
          MBA-Vault
        </Link>

        <nav className="hidden gap-1 desk:flex">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-full bg-qbub px-3 py-1.5 text-[13px] font-semibold text-tx"
                    : "rounded-full px-3 py-1.5 text-[13px] text-tx2 hover:text-tx"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
