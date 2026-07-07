"use client";

// Wraps every page with the shared chrome (header + mobile tab bar), except the
// screens where it doesn't belong: /login (pre-auth) and /offline (no navigation
// possible). usePathname returns the path WITHOUT the /vault basePath, so we match
// on "/login", "/browse", etc.
import { usePathname } from "next/navigation";
import { AppHeader } from "./app-header";
import { BottomTabs } from "./bottom-tabs";

const BARE_PATHS = ["/login", "/offline"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (bare) return <>{children}</>;

  return (
    <>
      <AppHeader />
      {/* pb-20 clears the fixed bottom bar on mobile; no bar on desktop. */}
      <div className="flex flex-1 flex-col pb-20 desk:pb-0">{children}</div>
      <BottomTabs />
    </>
  );
}
