"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReadAgain({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="font-medium underline"
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/scan/${id}/read`, { method: "POST" }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Reading… (10–30 seconds)" : label}
    </button>
  );
}
