import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { LiveRefresh, MarkAllRead } from "./notification-live";

interface Row {
  id: string;
  type: string;
  payload: { title?: string; body?: string; href?: string };
  href: string;
  priority: string;
  read_at: string | null;
  created_at: string;
}

/** In-app notifications (latest 10). Refreshes live through Supabase Realtime when a new one arrives. */
export async function NotificationBell({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("id, type, payload, href, priority, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  const rows = (data as Row[] | null) ?? [];
  const unread = count ?? 0;

  return (
    <details className="relative">
      <LiveRefresh userId={userId} />
      <summary className="relative flex cursor-pointer list-none rounded-lg p-2 hover:bg-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border bg-card p-2 shadow-lg">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && <MarkAllRead />}
        </div>
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-muted/60"}>
                <Link href={`/notifications/open/${n.id}`} className="block rounded px-2 py-2 text-sm hover:bg-muted">
                  <span className="block font-medium">
                    {n.priority === "high" && <span className="mr-1 text-danger">●</span>}
                    {n.payload.title ?? n.type.replace(/[._]/g, " ")}
                  </span>
                  {n.payload.body && <span className="block text-xs text-muted-foreground">{n.payload.body}</span>}
                  <span className="block text-[11px] text-muted-foreground">{formatDate(n.created_at, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/notifications" className="block border-t px-2 pt-2 text-center text-xs text-brand underline">See all</Link>
      </div>
    </details>
  );
}
