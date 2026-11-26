import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { KIND_INFO, type ScanKind } from "@/lib/scan/kinds";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { discardScan } from "../actions";
import { BillForm, DeliveryForm, ExpenseForm, PaymentForm, TransferForm, TransmittalForm } from "./forms";
import { ReadAgain } from "./read-again";

export const metadata = { title: "Check scanned document" };
export const maxDuration = 60;

const RECORD_HREF: Record<string, (id: string) => string> = {
  stock_receipts: (id) => `/inventory/receipts/${id}`,
  stock_transfers: (id) => `/inventory/transfers/${id}`,
  document_transmittals: (id) => `/accounting/transmittals/${id}`,
  supplier_invoices: (id) => `/procurement/invoices/${id}`,
  payments: () => "/sales/payments",
};

export default async function ScanReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("document_scans").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const scan = data as { id: string; kind: ScanKind; status: string; extracted: Record<string, unknown>; ai_notes: string; error: string; record_table: string; record_id: string | null; created_by: string; created_at: string };
  const { data: att } = await supabase.from("attachments").select("storage_path, mime_type, filename").eq("record_table", "document_scans").eq("record_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const file = att as { storage_path: string; mime_type: string; filename: string } | null;
  const signed = file ? (await supabase.storage.from("attachments").createSignedUrl(file.storage_path, 600)).data?.signedUrl : null;
  const open = ["ready", "failed", "reading"].includes(scan.status);
  const mine = scan.created_by === me.id;
  const x = scan.extracted ?? {};
  const props = { scanId: id, x, sp };

  return (
    <>
      <PageHeader title={`Check: ${KIND_INFO[scan.kind].label}`} description={`Scanned ${formatDate(scan.created_at)}. Compare each field with the photo, fix anything wrong, then save.`} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <Card className="p-2">
            {signed && file?.mime_type.startsWith("image/") ? (
              <a href={signed} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private 10-minute signed link, not cacheable by next/image */}
                <img src={signed} alt="Scanned document" className="max-h-[75vh] w-full rounded-lg object-contain" /></a>
            ) : signed ? (
              <a href={signed} target="_blank" rel="noreferrer" className="block p-4 text-brand underline">Open the scanned file ({file?.filename})</a>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No photo was uploaded.</p>
            )}
          </Card>
          {signed && <p className="text-xs text-muted-foreground">Tap the photo to open it full size.</p>}
        </div>
        <div className="space-y-3 lg:col-span-3">
          {scan.status === "done" && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
              Saved.{" "}
              {scan.record_id && RECORD_HREF[scan.record_table] ? <Link href={RECORD_HREF[scan.record_table](scan.record_id)} className="underline">Open the record</Link> : null}
            </p>
          )}
          {scan.status === "discarded" && <p className="rounded-lg bg-muted p-3 text-sm">This scan was discarded.</p>}
          {scan.status === "reading" && <p className="rounded-lg bg-muted p-3 text-sm">Still reading, or the reading stopped. {mine && <ReadAgain id={id} label="Read it now" />}</p>}
          {scan.status === "failed" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{scan.error || "The document couldn't be read."} {mine && <ReadAgain id={id} label="Try reading again" />}</p>}
          {scan.ai_notes && open && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Check:</b> {scan.ai_notes}</p>}
          {open && (
            <Card>
              <CardTitle>Details read from the document</CardTitle>
              {scan.kind === "delivery_receipt" && <DeliveryForm {...props} />}
              {scan.kind === "stock_transfer" && <TransferForm {...props} />}
              {scan.kind === "doc_transmittal" && <TransmittalForm {...props} />}
              {scan.kind === "supplier_bill" && <BillForm {...props} />}
              {scan.kind === "expense_receipt" && <ExpenseForm {...props} />}
              {scan.kind === "payment_slip" && <PaymentForm {...props} />}
            </Card>
          )}
          {open && mine && (
            <ActionForm action={discardScan} submitLabel="Discard this scan" variant="outline" confirm="Discard this scan? Nothing will be saved.">
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
