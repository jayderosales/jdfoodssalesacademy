import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ScanLink } from "@/components/shared/scan-original";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { confirmPayment, recordPayment, rejectPayment } from "../actions";
import { METHOD_LABEL, customerOptions } from "../parts";

export const metadata = { title: "Payments" };

type Pay = { id: string; number: string; method: string; amount: string; reference: string; status: string; paid_on: string; from_customer: boolean; received_by: string | null; created_at: string; reject_reason: string; proof_path: string | null; customers: { id: string; name: string } | null; sales_orders: { id: string; number: string; total: string } | null };

/** Finance checks each payment against the bank / GCash / Maya statement before it counts. */
export default async function PaymentsPage() {
  const me = await requirePermission(["sales.payments.record", "sales.payments.confirm"]);
  const access = await getAccess();
  const canConfirm = can(access, "sales.payments.confirm");
  const supabase = await createClient();
  const sel = "id, number, method, amount, reference, status, paid_on, from_customer, received_by, created_at, reject_reason, proof_path, customers(id, name), sales_orders(id, number, total)";
  const [{ data: pending }, { data: recent }, customers] = await Promise.all([
    supabase.from("payments").select(sel).eq("status", "pending").order("created_at").limit(200),
    supabase.from("payments").select(sel).neq("status", "pending").order("created_at", { ascending: false }).limit(50),
    customerOptions(),
  ]);
  const pend = (pending as unknown as Pay[] | null) ?? [];
  const done = (recent as unknown as Pay[] | null) ?? [];
  const pendTotal = pend.reduce((s, p) => s + Number(p.amount), 0);
  // customers' proof-of-payment photos: short-lived private links (storage policy limits them to finance / sales heads)
  const withProof = pend.filter((p) => p.proof_path);
  const proofUrls = new Map<string, string>();
  if (withProof.length) {
    const { data: signed } = await supabase.storage.from("payment-proofs").createSignedUrls(withProof.map((p) => p.proof_path!), 600);
    for (const x of signed ?? []) if (x.path && x.signedUrl) proofUrls.set(x.path, x.signedUrl);
  }

  return (
    <>
      <PageHeader title="Payments" description="Payments count only after finance confirms them. Whoever records a payment can't confirm it." actions={<ScanLink kind="payment_slip" label="Scan a payment slip" />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>To confirm ({pend.length} · {formatMoney(pendTotal.toFixed(2))})</CardTitle>
            {pend.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : (
              <ul className="divide-y">
                {pend.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold">{formatMoney(p.amount)} · {METHOD_LABEL[p.method]} · ref <span className="font-mono">{p.reference || "—"}</span></p>
                      <p className="text-muted-foreground">
                        {p.customers && <Link href={`/sales/customers/${p.customers.id}`} className="underline">{p.customers.name}</Link>}
                        {p.sales_orders && <> · <Link href={`/sales/orders/${p.sales_orders.id}`} className="underline">{p.sales_orders.number}</Link> (₱{Number(p.sales_orders.total).toLocaleString("en-PH")})</>}
                        {" · "}paid {formatDate(p.paid_on)} · {p.from_customer ? "sent by customer" : "recorded by staff"}
                      </p>
                      {p.proof_path && (proofUrls.get(p.proof_path)
                        ? <a href={proofUrls.get(p.proof_path)} target="_blank" rel="noreferrer" className="mt-1 inline-block font-medium text-brand underline">View proof of payment</a>
                        : <p className="mt-1 text-xs text-muted-foreground">Proof of payment attached (you don&apos;t have access to view it).</p>)}
                    </div>
                    {canConfirm && p.received_by !== me.id && (
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionForm action={confirmPayment} submitLabel="Confirm" className="flex"><input type="hidden" name="id" value={p.id} /></ActionForm>
                        <ActionForm action={rejectPayment} submitLabel="Reject" variant="outline" className="flex gap-1">
                          <input type="hidden" name="id" value={p.id} />
                          <Input name="reason" placeholder="Why?" required className="h-9 w-32" />
                        </ActionForm>
                      </div>
                    )}
                    {p.received_by === me.id && <span className="text-xs text-muted-foreground">You recorded this; someone else confirms.</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Recently checked</CardTitle>
            <Table>
              <thead><tr><Th>No.</Th><Th>Customer</Th><Th>Method</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></thead>
              <tbody>
                {done.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.number}<div className="text-xs text-muted-foreground">{formatDate(p.paid_on)}</div></Td>
                    <Td>{p.customers?.name}{p.sales_orders && <div className="text-xs"><Link href={`/sales/orders/${p.sales_orders.id}`} className="underline">{p.sales_orders.number}</Link></div>}</Td>
                    <Td>{METHOD_LABEL[p.method]}{p.reference ? <div className="font-mono text-xs">{p.reference}</div> : null}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.amount)}</Td>
                    <Td><StatusBadge status={p.status === "confirmed" ? "approved" : p.status} />{p.reject_reason && <div className="text-xs text-danger">{p.reject_reason}</div>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <Card>
          <CardTitle>Record a payment</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">For a specific order, record it on the order page. Use this for payments on account (e.g. opening balances).</p>
          <ActionForm action={recordPayment} submitLabel="Record payment">
            <Field label="Customer" htmlFor="customer_id">
              <Select id="customer_id" name="customer_id" required defaultValue="">
                <option value="" disabled>Choose</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Method" htmlFor="method">
              <Select id="method" name="method" defaultValue="bank_transfer">{Object.entries(METHOD_LABEL).filter(([k]) => k !== "paymongo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Amount (₱)" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" required /></Field>
            <Field label="Reference" htmlFor="reference"><Input id="reference" name="reference" /></Field>
            <Field label="Date paid" htmlFor="paid_on"><Input id="paid_on" name="paid_on" type="date" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
