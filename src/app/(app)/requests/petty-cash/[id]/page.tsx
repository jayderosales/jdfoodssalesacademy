import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline, peopleNames } from "@/components/shared/approval-timeline";
import { Attachments } from "@/components/shared/attachments";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, Card, CardTitle, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { cancelPettyCash, deletePettyCash, submitPettyCash } from "../actions";
import { PettyCashForm } from "../petty-cash-form";

export const metadata = { title: "Petty cash request" };

interface Pcr {
  id: string;
  number: string;
  amount: string;
  purpose: string;
  needed_on: string | null;
  status: string;
  requested_by: string;
  department_id: string | null;
  created_at: string;
  released_at: string | null;
  departments: { name: string } | null;
}

export default async function PettyCashPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; submitted?: string; error?: string }>;
}) {
  const { id } = await params;
  const { tab = "details", submitted, error } = await searchParams;
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: depts }, { data: pending }] = await Promise.all([
    supabase.from("petty_cash_requests").select("*, departments(name)").eq("id", id).maybeSingle(),
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
    supabase.from("approval_requests").select("id").eq("doc_type", "petty_cash").eq("record_id", id).eq("status", "pending").maybeSingle(),
  ]);
  if (!data) notFound();
  const p = data as Pcr;
  const mine = p.requested_by === me.id;
  const editable = mine && (p.status === "draft" || p.status === "returned");
  const names = await peopleNames([p.requested_by]);
  const access = await getAccess();
  const { data: rec } = p.released_at
    ? await supabase.from("expense_receipts").select("id, receipt_date, vendor_name, receipt_no, amount, vat_amount, description, scan_id, accounts(name)").eq("petty_cash_request_id", id).order("receipt_date")
    : { data: [] };
  const receipts = (rec as unknown as { id: string; receipt_date: string; vendor_name: string; receipt_no: string; amount: string; vat_amount: string; description: string; scan_id: string | null; accounts: { name: string } | null }[] | null) ?? [];
  const liquidated = receipts.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <RecordPage
      backHref="/requests/petty-cash"
      backLabel="Petty cash requests"
      title={p.number}
      status={<StatusBadge status={p.status} />}
      subtitle={`${formatMoney(p.amount)} · requested by ${names.get(p.requested_by) ?? "—"} · ${formatDate(p.created_at, true)}`}
      tabs={[
        { key: "details", label: "Details" },
        { key: "approvals", label: "Approvals" },
        { key: "history", label: "History" },
      ]}
      activeTab={tab}
      actions={
        <>
          {editable && (
            <ActionForm action={submitPettyCash} submitLabel={p.status === "returned" ? "Resubmit for approval" : "Send for approval"} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={p.id} />
            </ActionForm>
          )}
          {mine && (editable || p.status === "submitted") && (
            <ActionForm action={cancelPettyCash} submitLabel="Cancel request" variant="outline" className="flex flex-col gap-2" confirm="Cancel this request?">
              <input type="hidden" name="id" value={p.id} />
              {pending && <input type="hidden" name="approval_id" value={(pending as { id: string }).id} />}
            </ActionForm>
          )}
          {mine && p.status === "draft" && (
            <ActionForm action={deletePettyCash} submitLabel="Delete draft" variant="danger" className="flex flex-col gap-2" confirm="Delete this draft? This can't be undone.">
              <input type="hidden" name="id" value={p.id} />
            </ActionForm>
          )}
        </>
      }
    >
      {submitted && <div className="mb-4"><Alert tone="success">Sent for approval. You&apos;ll get a notification when it&apos;s decided.</Alert></div>}
      {error && <div className="mb-4"><Alert tone="danger">Saved as a draft, but it couldn&apos;t be sent for approval: {error}</Alert></div>}
      {p.status === "returned" && mine && (
        <div className="mb-4"><Alert>The approver returned this for changes. See their comment under Approvals, edit below, then resubmit.</Alert></div>
      )}

      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>{editable ? "Edit request" : "Request"}</CardTitle>
            {editable ? (
              <PettyCashForm
                values={{ id: p.id, amount: p.amount, purpose: p.purpose, needed_on: p.needed_on, department_id: p.department_id }}
                departments={(depts as { id: string; name: string }[] | null) ?? []}
              />
            ) : (
              <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold">{formatMoney(p.amount)}</dd>
                <dt className="text-muted-foreground">Purpose</dt>
                <dd className="whitespace-pre-wrap">{p.purpose}</dd>
                <dt className="text-muted-foreground">Needed on</dt>
                <dd>{formatDate(p.needed_on)}</dd>
                <dt className="text-muted-foreground">Department</dt>
                <dd>{p.departments?.name ?? "—"}</dd>
              </dl>
            )}
          </Card>
          <Attachments table="petty_cash_requests" id={p.id} canAdd={mine && ["draft", "returned", "submitted"].includes(p.status)} userId={me.id} />
          {p.released_at && (
            <Card className="lg:col-span-3">
              <CardTitle>Liquidation: receipts {formatMoney(liquidated.toFixed(2))} of {formatMoney(p.amount)}</CardTitle>
              {receipts.length > 0 ? (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Store</Th><Th>OR no.</Th><Th>For</Th><Th className="text-right">VAT</Th><Th className="text-right">Amount</Th></tr></thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <Td>{formatDate(r.receipt_date)}</Td>
                        <Td>{r.vendor_name}{r.scan_id && <Link href={`/scan/${r.scan_id}`} className="ml-1 text-xs underline">photo</Link>}</Td>
                        <Td>{r.receipt_no || "—"}</Td>
                        <Td>{r.accounts?.name}{r.description ? ` · ${r.description}` : ""}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(r.vat_amount)}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(r.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : <p className="text-sm text-muted-foreground">No receipts yet.</p>}
              <p className="mt-2 text-sm">
                {Number(p.amount) - liquidated > 0.004 ? <>Still to liquidate or return: <b>{formatMoney((Number(p.amount) - liquidated).toFixed(2))}</b>. </> : <span className="text-success">Fully liquidated. </span>}
                {(mine || can(access, "accounting.journals.create")) && Number(p.amount) - liquidated > 0.004 && <Link href="/scan?kind=expense_receipt" className="font-medium text-brand underline">Scan a receipt</Link>}
              </p>
            </Card>
          )}
        </div>
      )}
      {tab === "approvals" && <ApprovalTimeline docType="petty_cash" recordId={p.id} />}
      {tab === "history" && <RecordHistory tables={["petty_cash_requests"]} recordIds={[p.id]} />}
    </RecordPage>
  );
}
