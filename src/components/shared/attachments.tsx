import { Card, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { AttachmentUploader, DeleteAttachment } from "./attachments-client";

interface Row {
  id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  profiles: { full_name: string; email: string } | null;
}

function size(n: number) {
  return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Files attached to a record. Visible to anyone who can see the record; links expire after 5 minutes. */
export async function Attachments({ table, id, canAdd, userId }: { table: string; id: string; canAdd: boolean; userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("id, storage_path, filename, mime_type, size_bytes, uploaded_by, created_at, profiles!attachments_uploaded_by_fkey(full_name, email)")
    .eq("record_table", table)
    .eq("record_id", id)
    .order("created_at");
  const rows = (data as unknown as Row[] | null) ?? [];
  const signed = rows.length
    ? (await supabase.storage.from("attachments").createSignedUrls(rows.map((r) => r.storage_path), 300)).data ?? []
    : [];
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return (
    <Card>
      <CardTitle>Attachments</CardTitle>
      {rows.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No files yet.</p>}
      <ul className="mb-3 divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0">
              {urlFor.get(r.storage_path) ? (
                <a href={urlFor.get(r.storage_path)!} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-brand underline">{r.filename}</a>
              ) : (
                <span className="truncate">{r.filename}</span>
              )}
              <span className="block text-xs text-muted-foreground">
                {size(r.size_bytes)} · {r.profiles?.full_name || r.profiles?.email} · {formatDate(r.created_at, true)}
              </span>
            </span>
            {canAdd && r.uploaded_by === userId && <DeleteAttachment id={r.id} />}
          </li>
        ))}
      </ul>
      {canAdd && <AttachmentUploader table={table} id={id} />}
    </Card>
  );
}
