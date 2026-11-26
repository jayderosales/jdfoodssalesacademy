import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export interface StepRow {
  id: string;
  step_no: number;
  label: string;
  approver_ids: string[];
  status: string;
  assigned_at: string | null;
  acted_by: string | null;
  acted_on_behalf_of: string | null;
  acted_at: string | null;
  comment: string;
}
export interface RequestRow {
  id: string;
  number: string;
  status: string;
  submitted_at: string;
  decided_at: string | null;
  approval_steps: StepRow[];
}

/** Every approval round for a document (newest first), with who decided what and when. */
export async function ApprovalTimeline({ docType, recordId, linkToRequest = true }: { docType: string; recordId: string; linkToRequest?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("approval_requests")
    .select("id, number, status, submitted_at, decided_at, approval_steps(id, step_no, label, approver_ids, status, assigned_at, acted_by, acted_on_behalf_of, acted_at, comment)")
    .eq("doc_type", docType)
    .eq("record_id", recordId)
    .order("submitted_at", { ascending: false });
  const requests = (data as RequestRow[] | null) ?? [];
  const names = await peopleNames(requests.flatMap((r) => r.approval_steps.flatMap((s) => [...s.approver_ids, s.acted_by, s.acted_on_behalf_of])));

  return (
    <Card>
      <CardTitle>Approvals</CardTitle>
      {requests.length === 0 && <p className="text-sm text-muted-foreground">Not sent for approval yet.</p>}
      <div className="space-y-4">
        {requests.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {linkToRequest ? <Link href={`/approvals/${r.id}`} className="text-brand underline">{r.number}</Link> : r.number} · sent {formatDate(r.submitted_at, true)}
              </span>
              <StatusBadge status={r.status} />
            </div>
            <StepList steps={r.approval_steps} names={names} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StepList({ steps, names }: { steps: StepRow[]; names: Map<string, string> }) {
  return (
    <ol className="space-y-2">
      {[...steps].sort((a, b) => a.step_no - b.step_no).map((s) => (
        <li key={s.id} className="border-l-2 pl-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Step {s.step_no}: {s.label || "Approver"}</span>
            <StatusBadge status={s.status} />
          </div>
          {s.acted_by ? (
            <p className="text-xs text-muted-foreground">
              {names.get(s.acted_by) ?? "Someone"}
              {s.acted_on_behalf_of && ` for ${names.get(s.acted_on_behalf_of) ?? "someone"}`} · {formatDate(s.acted_at, true)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {s.status === "pending" ? "Waiting for " : s.status === "waiting" ? "Then " : ""}
              {s.approver_ids.map((id) => names.get(id) ?? "an approver").join(" or ")}
              {s.assigned_at && s.status === "pending" && ` · since ${formatDate(s.assigned_at, true)}`}
            </p>
          )}
          {s.comment && <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">“{s.comment}”</p>}
        </li>
      ))}
    </ol>
  );
}

/** Display names for a set of user ids (via a security-definer lookup so approvers' names show even without directory access). */
export async function peopleNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("people_names", { p_ids: unique });
  return new Map(((data as { id: string; name: string }[] | null) ?? []).map((p) => [p.id, p.name]));
}
