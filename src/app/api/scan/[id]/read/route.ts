import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readDocument } from "@/lib/ai/read-document";
import { getAuthState } from "@/lib/auth";
import type { ScanKind } from "@/lib/scan/kinds";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads the uploaded photo of a scan with the AI and stores the draft fields. Only the uploader can run it. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await getAuthState();
  if (!profile || profile.status !== "active") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const { data: scan } = await supabase.from("document_scans").select("id, kind, status, created_by").eq("id", id).maybeSingle();
  const s = scan as { id: string; kind: ScanKind; status: string; created_by: string } | null;
  if (!s || s.created_by !== profile.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!["reading", "failed", "ready"].includes(s.status)) return NextResponse.json({ error: "This scan is already closed." }, { status: 409 });

  const { data: att } = await supabase.from("attachments").select("storage_path, mime_type").eq("record_table", "document_scans").eq("record_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const a = att as { storage_path: string; mime_type: string } | null;
  if (!a) return NextResponse.json({ error: "Upload the photo first." }, { status: 400 });
  const { data: blob, error: dlErr } = await supabase.storage.from("attachments").download(a.storage_path);
  if (dlErr || !blob) {
    console.error("scan download failed", dlErr);
    return NextResponse.json({ error: "The photo couldn't be opened. Try uploading it again." }, { status: 500 });
  }

  const result = await readDocument({ userId: profile.id, scanId: id, kind: s.kind, bytes: Buffer.from(await blob.arrayBuffer()), mime: a.mime_type || blob.type });
  const update = result.ok
    ? { status: "ready", extracted: result.data, ai_notes: result.notes, error: "", model: result.model }
    : { status: "failed", error: result.error };
  const { error } = await supabase.from("document_scans").update(update).eq("id", id);
  if (error) {
    console.error("scan update failed", error);
    return NextResponse.json({ error: "Couldn't save what was read. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: result.ok, error: result.ok ? undefined : result.error });
}
