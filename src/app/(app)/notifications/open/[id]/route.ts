import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Clicking a notification: mark it read, then go to the record it's about. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("href").eq("id", id).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  return NextResponse.redirect(new URL(safeNext((data as { href: string } | null)?.href || "/notifications", "/notifications"), request.url));
}
