export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-slate-600 dark:text-slate-400">
        MBA-Vault can browse cached pages while offline, but asking questions needs an
        internet connection. Reconnect to use the Ask feature.
      </p>
    </main>
  );
}
