"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { markAllNotificationsRead } from "@/app/(app)/notifications/actions";

/** Re-renders the page when a new notification for this user arrives (Supabase Realtime; RLS limits it to own rows). */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);
  return null;
}

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-brand underline"
      onClick={() => start(async () => { await markAllNotificationsRead(); router.refresh(); })}
    >
      Mark all read
    </button>
  );
}
