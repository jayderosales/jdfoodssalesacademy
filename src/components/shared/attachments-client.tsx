"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { deleteAttachment, recordAttachment } from "@/app/(app)/attachment-actions";

const MAX = 20 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.csv,.xlsx,.xls,.docx,.doc";

/** Upload straight from the browser to private Storage (phone camera works), then record it on the server. */
export function AttachmentUploader({ table, id }: { table: string; id: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const supabase = createBrowserSupabase();
    for (const file of Array.from(files)) {
      if (file.size > MAX) {
        setError(`${file.name} is larger than 20 MB.`);
        continue;
      }
      const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
      const path = `${table}/${id}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        setError(`${file.name}: ${upErr.message}`);
        continue;
      }
      const res = await recordAttachment({ table, id, path, filename: file.name.slice(0, 200), mime: file.type, size: file.size });
      if (res.error) setError(res.error);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div
      className="rounded-lg border-2 border-dashed p-4 text-center text-sm"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(e.dataTransfer.files);
      }}
    >
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" id={`att-${id}`} onChange={(e) => upload(e.target.files)} />
      <label htmlFor={`att-${id}`} className="inline-flex cursor-pointer items-center gap-2 font-medium text-brand">
        <Paperclip className="size-4" aria-hidden /> {busy ? "Uploading…" : "Add files or take a photo"}
      </label>
      <p className="mt-1 text-xs text-muted-foreground">Images, PDF, Excel, Word. Up to 20 MB each. You can also drag files here.</p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function DeleteAttachment({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted-foreground underline"
      onClick={() => {
        if (!window.confirm("Remove this file?")) return;
        start(async () => {
          await deleteAttachment(id);
          router.refresh();
        });
      }}
    >
      Remove
    </button>
  );
}
