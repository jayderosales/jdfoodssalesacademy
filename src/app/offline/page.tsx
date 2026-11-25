export const metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when a page can't be loaded because the device is offline. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h1 className="mb-2 text-xl font-bold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">Check your mobile data or Wi-Fi, then try again.</p>
        <a href="/dashboard" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Try again</a>
      </div>
    </main>
  );
}
