"use client";

import Link from "next/link";

/** Friendly fallback for any page error inside the signed-in app (instead of a blank "Application error"). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="mb-2 text-xl font-bold">Something went wrong on this page</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Try again. If it keeps happening, tell your administrator and mention this code: <span className="font-mono">{error.digest ?? "n/a"}</span>
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm">
          Go to Home
        </Link>
      </div>
    </div>
  );
}
