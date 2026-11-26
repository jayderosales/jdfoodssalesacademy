import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { Attachments } from "@/components/shared/attachments";
import { ScanOriginal } from "@/components/shared/scan-original";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { receiveTransmittal } from "../../../scan/actions";

export const metadata = { title: "Transmittal" };

export default async function TransmittalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("document_transmittals").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as { id: string; number: string; sent_on: string; from_name: string; to_name: string; notes: string; status: string; created_by: string; scan_id: string | null };
  const { data: lines } = await supabase.from("document_transmittal_lines").select("id, line_no, doc_type, doc_no, party, doc_date, amount, received, received_at, note, profiles:received_by(full_name)").eq("transmittal_id", id).order("line_no");
  type L = { id: string; doc_type: string; doc_no: string; party: string; doc_date: string | null; amount: string | null; received: boolean; received_at: string | null; note: string; profiles: { full_name: string } | null };
  const ls = (lines as unknown as L[] | null) ?? [];
  const canReceive = can(access, "transmittals.receive") && t.created_by !== me.id && t.status !== "received";
  const total = ls.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const pending = ls.filter((l) => !l.received);

  const table = (
    <Table>
      <thead><tr>{canReceive && <Th>Got it</Th>}<Th>Document</Th><Th>Customer / supplier</Th><Th>Date</Th><Th className="text-right">Amount</Th><Th>Received</Th></tr></thead>
      <tbody>
        {ls.map((l) => (
          <tr key={l.id} className={l.received ? "text-muted-foreground" : ""}>
            {canReceive && <Td>{!l.received && <input type="checkbox" name="line" value={l.id} aria-label={`Received ${l.doc_type} ${l.doc_no}`} className="size-5" />}</Td>}
            <Td><b>{l.doc_type}</b> {l.doc_no}</Td>
            <Td>{l.party}</Td>
            <Td>{formatDate(l.doc_date)}</Td>
            <Td className="text-right tabular-nums">{l.amount != null ? formatMoney(l.amount) : ""}</Td>
            <Td className="text-xs">{l.received ? <span className="text-success">✓ {l.profiles?.full_name} · {formatDate(l.received_at)}{l.note ? ` · ${l.note}` : ""}</span> : "Not yet"}</Td>
          </tr>
        ))}
        {total > 0 && <tr className="font-semibold"><Td colSpan={canReceive ? 4 : 3}>Total</Td><Td className="text-right">{formatMoney(total.toFixed(2))}</Td><Td /></tr>}
      </tbody>
    </Table>
  );

  return (
    <>
      <PageHeader title={`Transmittal ${t.number}`} description={`${t.from_name} → ${t.to_name} · sent ${formatDate(t.sent_on)}${t.notes ? ` · ${t.notes}` : ""}`} actions={<span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{t.status === "received" ? "All received" : t.status === "partial" ? `${pending.length} still missing` : "Not yet received"}</span>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            {canReceive ? (
              <ActionForm action={receiveTransmittal} submitLabel="Mark ticked documents received" className="space-y-3">
                <input type="hidden" name="id" value={id} />
                {table}
                <Field label="Note (optional, e.g. a missing page)" htmlFor="note"><Input id="note" name="note" /></Field>
              </ActionForm>
            ) : table}
            {t.created_by === me.id && t.status !== "received" && <p className="mt-2 text-xs text-muted-foreground">Accounting ticks off each document when it arrives. Someone other than you must receive them.</p>}
          </Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["document_transmittals", "document_transmittal_lines"]} recordIds={[id, ...ls.map((l) => l.id)]} /></Card>
        </div>
        <div className="space-y-4">
          <ScanOriginal table="document_transmittals" id={id} />
          <Card><CardTitle>Files</CardTitle><Attachments table="document_transmittals" id={id} canAdd userId={me.id} /></Card>
        </div>
      </div>
    </>
  );
}
