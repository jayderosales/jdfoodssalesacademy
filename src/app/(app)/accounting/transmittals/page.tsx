import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { scanCreateTransmittal } from "../../scan/actions";

export const metadata = { title: "Document transmittals" };

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Not yet received", cls: "text-amber-700" },
  partial: { label: "Partly received", cls: "text-amber-700" },
  received: { label: "All received", cls: "text-success" },
};

export default async function TransmittalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const access = await getAccess();
  const receiver = can(access, "transmittals.receive");
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("document_transmittals").select("id, number, sent_on, from_name, to_name, status, created_by, document_transmittal_lines(count)").order("sent_on", { ascending: false }).order("number", { ascending: false }).limit(200);
  if (sp.status && STATUS[sp.status]) q = q.eq("status", sp.status);
  else if (receiver && !sp.status) q = q.neq("status", "received");
  const { data } = await q;
  const rows = (data as unknown as { id: string; number: string; sent_on: string; from_name: string; to_name: string; status: string; created_by: string; document_transmittal_lines: { count: number }[] }[] | null) ?? [];
  const blank = Array.from({ length: 6 });

  return (
    <>
      <PageHeader
        title="Document transmittals"
        description="List the invoices, receipts, cheques and other papers you hand to accounting. Accounting ticks off each one when it arrives, so nothing gets lost between branches and the office."
        actions={<Link href="/scan?kind=doc_transmittal" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">Scan a transmittal</Link>}
      />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {[["", receiver ? "Waiting to receive" : "All"], ["open", "Not yet received"], ["partial", "Partly received"], ["received", "All received"]].map(([k, l]) => (
          <Link key={k} href={k ? `/accounting/transmittals?status=${k}` : "/accounting/transmittals"} className={`rounded-full border px-3 py-1 ${(sp.status ?? "") === k ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{l}</Link>
        ))}
      </div>
      <Card className="mb-4">
        <CardTitle>Transmittals</CardTitle>
        <Table>
          <thead><tr><Th>Number</Th><Th>Date</Th><Th>From</Th><Th>To</Th><Th className="text-right">Documents</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/accounting/transmittals/${r.id}`} className="font-medium text-brand underline">{r.number}</Link>{r.created_by === me.id && <span className="ml-1 text-xs text-muted-foreground">(yours)</span>}</Td>
                <Td>{formatDate(r.sent_on)}</Td>
                <Td>{r.from_name}</Td>
                <Td>{r.to_name}</Td>
                <Td className="text-right">{r.document_transmittal_lines?.[0]?.count ?? 0}</Td>
                <Td className={STATUS[r.status]?.cls}>{STATUS[r.status]?.label}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No transmittals here.</p>}
      </Card>
      <details className="rounded-xl border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">Type a transmittal instead of scanning</summary>
        <ActionForm action={scanCreateTransmittal} submitLabel="Save transmittal" className="mt-3 space-y-3">
          <input type="hidden" name="rows" value={blank.length} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="From (person / branch)" htmlFor="from_name"><Input id="from_name" name="from_name" defaultValue={me.full_name} required /></Field>
            <Field label="To" htmlFor="to_name"><Input id="to_name" name="to_name" defaultValue="Accounting" /></Field>
            <Field label="Date sent" htmlFor="sent_on"><Input id="sent_on" name="sent_on" type="date" defaultValue={manilaToday()} /></Field>
          </div>
          <Table>
            <thead><tr><Th>Document type</Th><Th>No.</Th><Th>Customer / supplier</Th><Th>Date</Th><Th>Amount</Th></tr></thead>
            <tbody>
              {blank.map((_, i) => (
                <tr key={i}>
                  <Td><Input name={`l${i}_doc_type`} placeholder={i === 0 ? "Sales invoice" : ""} className="h-8" aria-label={`Document type line ${i + 1}`} /></Td>
                  <Td><Input name={`l${i}_doc_no`} className="h-8 w-28" aria-label="Document number" /></Td>
                  <Td><Input name={`l${i}_party`} className="h-8" aria-label="Customer or supplier" /></Td>
                  <Td><Input name={`l${i}_doc_date`} type="date" className="h-8" aria-label="Document date" /></Td>
                  <Td><Input name={`l${i}_amount`} inputMode="decimal" className="h-8 w-28" aria-label="Amount" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ActionForm>
      </details>
    </>
  );
}
