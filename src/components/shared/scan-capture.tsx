"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { recordAttachment } from "@/app/(app)/attachment-actions";
import { startScan } from "@/app/(app)/scan/actions";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { shrinkImage as shrink } from "@/lib/image-shrink";
import { KIND_INFO, type ScanKind } from "@/lib/scan/kinds";

export function ScanCapture({ kinds, defaultKind }: { kinds: ScanKind[]; defaultKind?: ScanKind }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ScanKind>(defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0]);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  async function go(files: FileList | null) {
    const original = files?.[0];
    if (!original) return;
    setError("");
    try {
      setStep("Preparing the photo…");
      const file = await shrink(original);
      if (file.size > 20 * 1024 * 1024) throw new Error("The file is larger than 20 MB.");
      const started = await startScan(kind, file.name.slice(0, 200));
      if ("error" in started) throw new Error(started.error);
      setStep("Uploading…");
      const supabase = createBrowserSupabase();
      const path = `document_scans/${started.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "_").slice(-100)}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);
      const rec = await recordAttachment({ table: "document_scans", id: started.id, path, filename: file.name.slice(0, 200), mime: file.type, size: file.size });
      if (rec.error) throw new Error(rec.error);
      setStep("Reading the document… (about 10–30 seconds)");
      await fetch(`/api/scan/${started.id}/read`, { method: "POST" }).catch(() => null); // the review page shows any reading error
      router.push(`/scan/${started.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setStep("");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {kinds.length > 1 && (
        <fieldset className="grid gap-2 sm:grid-cols-2" disabled={!!step}>
          <legend className="mb-1 text-sm font-medium">What are you scanning?</legend>
          {kinds.map((k) => (
            <label key={k} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${k === kind ? "border-brand bg-brand/5" : ""}`}>
              <input type="radio" name="kind" value={k} checked={k === kind} onChange={() => setKind(k)} className="mt-1" />
              <span><b>{KIND_INFO[k].label}</b><span className="block text-xs text-muted-foreground">{KIND_INFO[k].hint}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      <input ref={input} id="scan-file" type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => go(e.target.files)} />
      <label htmlFor="scan-file" aria-disabled={!!step} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-base font-semibold text-brand ${step ? "pointer-events-none opacity-60" : "hover:bg-muted"}`}>
        <Camera className="size-5" aria-hidden /> {step || `Take a photo of the ${KIND_INFO[kind].label.toLowerCase()}`}
      </label>
      <p className="text-xs text-muted-foreground">Lay the paper flat in good light with all four corners showing. A PDF scan works too. You&apos;ll check everything before it&apos;s saved.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
