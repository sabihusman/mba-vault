import { LogoutButton } from "./logout-button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="absolute right-4 top-4">
        <LogoutButton />
      </div>
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-2xl font-bold text-white dark:bg-slate-800">
          MV
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">MBA-Vault</h1>
        <p className="max-w-md text-balance text-slate-600 dark:text-slate-400">
          A private, mobile-ready vault over your MBA &amp; Product School coursework —
          browse your materials by topic and ask questions with cited sources.
        </p>
      </div>
      <p className="rounded-full border border-slate-200 px-4 py-1.5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Scaffolding in progress · auth, browse, and Ask coming next
      </p>
    </main>
  );
}
