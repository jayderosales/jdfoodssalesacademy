import Link from "next/link";
import { notFound } from "next/navigation";
import { peopleNames, StepList, type StepRow } from "@/components/shared/approval-timeline";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { DecisionForm } from "./decision-form";

export const metadata = { title: "Approval" };

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: myIds }] = await Promise.all([
    supabase
      .from("approval_requests")
      .select("*, approval_doc_types(label, href_template), approval_steps(id, step_no, label, approver_ids, status, assigned_at, acted_by, acted_on_behalf_of, acted_at, comment)")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("my_approver_ids"),
  ]);
  if (!data) notFound();
  const r = data as {
    id: string; number: string; title: string; amount: string | null; status: string; requested_by: string; record_id: string;
    submitted_at: string; decided_at: string | null; approval_doc_types: { label: string; href_template: string } | null; approval_steps: StepRow[];
  };
  const ids = new Set((myIds as string[] | null) ?? [me.id]);
  const pendingStep = r.approval_steps.find((s) => s.status === "pending");
  const canDecide = r.status === "pending" && !!pendingStep && r.requested_by !== me.id && pendingStep.approver_ids.some((x) => ids.has(x));
  const onBehalf = canDecide && !pendingStep!.approver_ids.includes(me.id);
  const names = await peopleNames([r.requested_by, ...r.approval_steps.flatMap((s) => [...s.approver_ids, s.acted_by, s.acted_on_behalf_of])]);
  const docHref = r.approval_doc_types?.href_template.replace("{{id}}", r.record_id);

  return (
    <RecordPage
      backHref="/approvals"
      backLabel="Approvals"
      title={r.number}
      status={<StatusBadge status={r.status} />}
      subtitle={`${r.approval_doc_types?.label ?? "Request"} from ${names.get(r.requested_by) ?? "—"} · sent ${formatDate(r.submitted_at, true)}`}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>{r.title}</CardTitle>
            <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="text-lg font-semibold">{r.amount ? formatMoney(r.amount) : "—"}</dd>
              <dt className="text-muted-foreground">Document</dt>
              <dd>{docHref ? <Link href={docHref} className="text-brand underline">Open the full request, receipts and history →</Link> : "—"}</dd>
            </dl>
          </Card>
          <Card>
            <CardTitle>Steps</CardTitle>
            <StepList steps={r.approval_steps} names={names} />
          </Card>
        </div>
        <div>
          {canDecide ? (
            <Card>
              <CardTitle>Your decision</CardTitle>
              {onBehalf && <p className="mb-2 text-xs text-muted-foreground">You&apos;re deciding on behalf of someone who delegated their approvals to you.</p>}
              <DecisionForm stepId={pendingStep!.id} requestId={r.id} />
            </Card>
          ) : (
            <Card>
              <CardTitle>Status</CardTitle>
              <p className="text-sm text-muted-foreground">
                {r.status === "pending"
                  ? r.requested_by === me.id
                    ? "Waiting for the approver. You'll be notified when it's decided."
                    : "Waiting for another approver."
                  : `Decided ${formatDate(r.decided_at, true)}.`}
              </p>
            </Card>
          )}
        </div>
      </div>
    </RecordPage>
  );
}
