import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Attachments } from "@/components/shared/attachments";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { paymentAction, updatePaymentLine } from "../../actions";
import { PAY_STATUS } from "../../parts";

export const metadata = { title: "Supplier payment" };

export default async function SupplierPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("supplier_payments").select("*, suppliers(id, name, tin, ewt_rate), accounts(code, name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as unknown as { id: string; number: string; pay_date: string; method: string; reference: string; gross: string; ewt_amount: string; net_paid: string; status: string; notes: string; paid_at: string | null; suppliers: { id: string; name: string; tin: string; ewt_rate: string } | null; accounts: { code: string; name: string } | null };
  const { data: lines } = await supabase.from("supplier_payment_lines").select("id, amount, ewt_amount, supplier_invoices(id, invoice_no, number, due_date, total, paid_amount)").eq("payment_id", id).order("id");
  type L = { id: string; amount: string; ewt_amount: string; supplier_invoices: { id: string; invoice_no: string; number: string; due_date: string | null; total: string; paid_amount: string } | null };
  const ls = (lines as unknown as L[] | null) ?? [];
  const canPay = can(access, "ap.payments.create");
  const editable = canPay && ["draft", "returned"].includes(p.status);
  const { data: je } = p.status === "paid" ? await supabase.from("journal_entries").select("id, number").eq("source_table", "supplier_payments").eq("source_id", id).maybeSingle() : { data: null };

  return (
    <>
      <PageHeader
        title={`Supplier payment ${p.number}`}
        description={`${p.suppliers?.name ?? "?"} · from ${p.accounts?.code} ${p.accounts?.name} · ${p.method.replace("_", " ")} · ${formatDate(p.pay_date)}`}
        actions={<span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{PAY_STATUS[p.status] ?? p.status}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Due</Th><Th className="text-right">Invoice total</Th><Th className="text-right">Paying now</Th><Th className="text-right">Tax withheld</Th></tr></thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <Td><Link href={`/procurement/invoices/${l.supplier_invoices?.id}`} className="text-brand underline">{l.supplier_invoices?.invoice_no}</Link><div className="text-xs text-muted-foreground">{l.supplier_invoices?.number}</div></Td>
                    <Td>{formatDate(l.supplier_invoices?.due_date ?? null)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(l.supplier_invoices?.total)}</Td>
                    <Td className="text-right">
                      {editable ? (
                        <ActionForm action={updatePaymentLine} submitLabel="Update" variant="outline" className="flex items-center justify-end gap-1">
                          <input type="hidden" name="id" value={l.id} /><input type="hidden" name="payment_id" value={id} />
                          <Input name="amount" defaultValue={Number(l.amount).toFixed(2)} inputMode="decimal" className="h-8 w-28" aria-label="Amount to pay" />
                        </ActionForm>
                      ) : <span className="tabular-nums">{formatMoney(l.amount)}</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(l.ewt_amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {ls.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No invoices on this payment.</p>}
            {editable && <p className="mt-1 text-xs text-muted-foreground">Set an amount to 0 to take the invoice off this payment.</p>}
            <div className="mt-3 space-y-0.5 text-right text-sm">
              <p>Invoices settled {formatMoney(p.gross)}</p>
              <p>Less tax withheld ({Number(p.suppliers?.ewt_rate ?? 0)}% of the net-of-VAT amount) {formatMoney(p.ewt_amount)}</p>
              <p className="text-lg font-bold">Amount to pay out {formatMoney(p.net_paid)}</p>
            </div>
            {Number(p.ewt_amount) > 0 && <p className="mt-2 text-xs text-muted-foreground">Give the supplier BIR Form 2307 for the tax withheld (supplier TIN: {p.suppliers?.tin || "missing, add it on the supplier record"}).</p>}
          </Card>
          {["submitted", "approved", "rejected", "returned", "paid"].includes(p.status) && <ApprovalTimeline docType="supplier_payment" recordId={id} />}
          <Card><CardTitle>Proof of payment</CardTitle><Attachments table="supplier_payments" id={id} canAdd={canPay} userId={me.id} /></Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["supplier_payments", "supplier_payment_lines"]} recordIds={[id, ...ls.map((l) => l.id)]} /></Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Next step</CardTitle>
            <div className="space-y-3 text-sm">
              {editable && ls.length > 0 && <ActionForm action={paymentAction} submitLabel="Send to CEO for approval"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="submit" /></ActionForm>}
              {p.status === "submitted" && <p>Waiting for the CEO&apos;s approval.</p>}
              {p.status === "approved" && canPay && (
                <>
                  <p>Approved. Pay the supplier through the bank, then record it here.</p>
                  <ActionForm action={paymentAction} submitLabel="Mark as paid">
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="paid" />
                    <Field label="Bank / cheque reference" htmlFor="reference"><Input id="reference" name="reference" required /></Field>
                    <Field label="Date paid" htmlFor="pay_date"><Input id="pay_date" name="pay_date" type="date" defaultValue={p.pay_date} /></Field>
                  </ActionForm>
                </>
              )}
              {p.status === "paid" && (
                <p className="text-success">Paid {p.paid_at ? formatDate(p.paid_at) : ""}{p.reference ? ` · ref ${p.reference}` : ""}.{je && <> Posted as <Link href={`/accounting/journals/${(je as { id: string }).id}`} className="underline">{(je as { number: string }).number}</Link>.</>}</p>
              )}
              {canPay && ["draft", "returned", "submitted", "approved"].includes(p.status) && (
                <ActionForm action={paymentAction} submitLabel="Cancel payment" variant="outline" confirm="Cancel this payment?"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="cancel" /></ActionForm>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
