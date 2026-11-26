import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

/** Header button that opens "Scan a document" for one kind. */
export function ScanLink({ kind, label = "Scan a document" }: { kind: string; label?: string }) {
  return <Link href={`/scan?kind=${kind}`} className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-brand hover:bg-muted">📷 {label}</Link>;
}

/** The photo a record was encoded from, if it came from "Scan a document". Shows nothing otherwise (or if you can't see the scan). */
export async function ScanOriginal({ table, id }: { table: string; id: string }) {
  const supabase = await createClient();
  const { data: scans } = await supabase.from("document_scans").select("id").eq("record_table", table).eq("record_id", id).eq("status", "done").limit(3);
  const ids = ((scans as { id: string }[] | null) ?? []).map((s) => s.id);
  if (!ids.length) return null;
  const { data: atts } = await supabase.from("attachments").select("record_id, storage_path, mime_type").eq("record_table", "document_scans").in("record_id", ids);
  const files = (atts as { record_id: string; storage_path: string; mime_type: string }[] | null) ?? [];
  const signed = await Promise.all(files.map(async (f) => ({ ...f, url: (await supabase.storage.from("attachments").createSignedUrl(f.storage_path, 600)).data?.signedUrl ?? null })));
  return (
    <Card>
      <CardTitle>Scanned original</CardTitle>
      {signed.map((f) => (
        <div key={f.storage_path} className="mb-2">
          {f.url && f.mime_type.startsWith("image/") ? (
            <a href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- private 10-minute signed link, not cacheable by next/image */}
              <img src={f.url} alt="Scanned document" className="max-h-80 w-full rounded-lg border object-contain" /></a>
          ) : f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer" className="text-brand underline">Open scanned file</a>
          ) : null}
          <Link href={`/scan/${f.record_id}`} className="text-xs underline">What was read from it</Link>
        </div>
      ))}
    </Card>
  );
}
