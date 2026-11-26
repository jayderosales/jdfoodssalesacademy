import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { MoneyInput } from "@/components/shared/inputs";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { savePolicy } from "../engine-actions";

export const metadata = { title: "Approval policies" };

interface Policy {
  id: string;
  doc_type: string;
  name: string;
  min_amount: string | null;
  max_amount: string | null;
  priority: number;
  active: boolean;
  approval_policy_steps: { step_no: number; approver_type: string; role_id: string | null; roles: { name: string } | null }[];
  approval_doc_types: { label: string } | null;
}

const TYPE_LABEL: Record<string, string> = { supervisor: "Requester's supervisor", department_head: "Department head", user: "Named person" };

export default async function ApprovalPoliciesPage() {
  await requirePermission(["admin.approvals.manage", "admin.settings.manage"]);
  const access = await getAccess();
  const canEdit = can(access, "admin.approvals.manage");
  const supabase = await createClient();
  const [{ data }, { data: roles }] = await Promise.all([
    supabase.from("approval_policies").select("*, approval_doc_types(label), approval_policy_steps(step_no, approver_type, role_id, roles(name))").order("doc_type").order("active", { ascending: false }).order("min_amount", { nullsFirst: true }),
    supabase.from("roles").select("id, name").eq("is_internal", true).eq("active", true).order("name"),
  ]);
  const policies = (data as Policy[] | null) ?? [];
  const range = (p: Policy) =>
    p.min_amount && p.max_amount ? `${formatMoney(p.min_amount)} – ${formatMoney(p.max_amount)}` : p.max_amount ? `Up to ${formatMoney(p.max_amount)}` : p.min_amount ? `${formatMoney(p.min_amount)} and above` : "Any amount";

  return (
    <>
      <PageHeader
        title="Approval policies"
        description="Which role approves which request, by amount. Requests already waiting keep the approvers they were given."
        actions={<Link href="/admin/settings" className="text-sm text-brand underline">All settings</Link>}
      />
      <div className="space-y-3">
        {policies.map((p) => {
          const steps = [...p.approval_policy_steps].sort((a, b) => a.step_no - b.step_no);
          const simple = steps.length === 1 && steps[0].approver_type === "role";
          return (
            <Card key={p.id} className={p.active ? "" : "opacity-70"}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge>{p.approval_doc_types?.label}</Badge>
                  {!p.active && <Badge>inactive template</Badge>}
                  <span className="text-sm text-muted-foreground">
                    {range(p)} → {steps.map((s) => s.roles?.name ?? TYPE_LABEL[s.approver_type] ?? s.approver_type).join(", then ")}
                  </span>
                </summary>
                {canEdit && (
                  <div className="mt-3">
                    <ActionForm action={savePolicy} submitLabel="Save policy" variant="outline">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Name" htmlFor={`n-${p.id}`}><Input id={`n-${p.id}`} name="name" defaultValue={p.name} required /></Field>
                        <Field label="From amount (blank = ₱0)" htmlFor={`min-${p.id}`}><MoneyInput id={`min-${p.id}`} name="min_amount" defaultValue={p.min_amount} /></Field>
                        <Field label="Up to amount (blank = no limit)" htmlFor={`max-${p.id}`}><MoneyInput id={`max-${p.id}`} name="max_amount" defaultValue={p.max_amount} /></Field>
                        {simple ? (
                          <Field label="Approved by" htmlFor={`r-${p.id}`}>
                            <Select id={`r-${p.id}`} name="role_id" defaultValue={steps[0].role_id ?? ""}>
                              {((roles as { id: string; name: string }[] | null) ?? []).map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </Select>
                          </Field>
                        ) : (
                          <p className="self-end text-xs text-muted-foreground">Multi-step policy: approvers can be changed by an administrator in the database for now.</p>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={p.active} className="size-4" /> Active
                      </label>
                    </ActionForm>
                  </div>
                )}
              </details>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        If two active policies cover the same amount, the one with the lower priority number wins. If nobody else holds the approving role, the request goes to the CEO.
      </p>
    </>
  );
}
