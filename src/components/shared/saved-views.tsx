"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSavedView, saveView } from "@/app/(app)/saved-view-actions";

/** Pick, save and delete named filter/column layouts for a table. */
export function SavedViews({ tableKey, views, current }: { tableKey: string; views: { id: string; name: string; query: string; mine: boolean }[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border px-3 py-2 text-sm hover:bg-muted">Saved views{views.length ? ` (${views.length})` : ""}</summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border bg-card p-3 shadow-lg">
        {views.length === 0 && <p className="mb-2 text-xs text-muted-foreground">No saved views yet.</p>}
        <ul className="mb-3 space-y-1">
          {views.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" className="truncate text-left text-brand underline" onClick={() => router.push(v.query || "?")}>
                {v.name}
                {!v.mine && <span className="ml-1 text-xs text-muted-foreground">(shared)</span>}
              </button>
              {v.mine && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => start(async () => { await deleteSavedView(v.id); router.refresh(); })}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="space-y-2 border-t pt-2"
          action={(form) =>
            start(async () => {
              const res = await saveView(tableKey, String(form.get("name") ?? ""), current, form.get("shared") === "on");
              setMsg(res.error ?? "Saved.");
              router.refresh();
            })
          }
        >
          <input name="name" required maxLength={60} placeholder="Name this view" className="w-full rounded border px-2 py-1 text-sm" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="shared" className="size-4" /> Share with everyone</label>
          <button type="submit" disabled={pending} className="rounded bg-brand px-3 py-1 text-xs font-medium text-white">Save current view</button>
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </form>
      </div>
    </details>
  );
}
