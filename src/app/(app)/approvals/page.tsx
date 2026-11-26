import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { peopleNames } from "@/components/shared/approval-timeline";

export const metadata = { title: "Approvals" };

interface Req {
  id: string;
  number: string;
  doc_type: string;
  title: string;
  amount: string | null;
  status: string;
  requested_by: string;
  submitted_at: string;
  decided_at: string | null;
}

const TABS = [
  { key: "waiting", label: "Waiting for me" },
  { key: "mine", label: "I submitted" },
  { key: "decided", label: "I decided" },
  { key: "all", label: "All", perm: true },
] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const access = await getAccess();
  const { tab = "waiting" } = await searchParams;
  const supabase = await createClient();
  const { data: myIds } = await supabase.rpc("my_approver_ids");
  const ids = (myIds as string[] | null) ?? [me.id];
  const canAll = can(access, ["approvals.view_all", "readonly.all"]);

  let requests: Req[] = [];
  const sel = "id, number, doc_type, title, amount, status, requested_by, submitted_at, decided_at";
  if (tab === "waiting") {
    const { data } = await supabase.from("approval_steps").select(`request_id, assigned_at, approval_requests!inner(${sel})`).eq("status", "pending").overlaps("approver_ids", ids).order("assigned_at");
    requests = ((data as unknown as { approval_requests: Req }[] | null) ?? []).map((r) => r.approval_requests).filter((r) => r.requested_by !== me.id && r.status === "pending");
  } else if (tab === "mine") {
    const { data } = await supabase.from("approval_requests").select(sel).eq("requested_by", me.id).order("submitted_at", { ascending: false }).limit(100);
    requests = (data as Req[] | null) ?? [];
  } else if (tab === "decided") {
    const { data } = await supabase.from("approval_steps").select(`acted_at, approval_requests!inner(${sel})`).eq("acted_by", me.id).order("acted_at", { ascending: false }).limit(100);
    requests = ((data as unknown as { approval_requests: Req }[] | null) ?? []).map((r) => r.approval_requests);
  } else if (tab === "all" && canAll) {
    const { data } = await supabase.from("approval_requests").select(sel).order("submitted_at", { ascending: false }).limit(200);
    requests = (data as Req[] | null) ?? [];
  }
  const names = await peopleNames(requests.map((r) => r.requested_by));

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Requests waiting for your decision, and the ones you sent."
        actions={<Link href="/approvals/delegations" className="text-sm text-brand underline">Away? Delegate your approvals</Link>}
      />
      <nav aria-label="Approval lists" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.filter((t) => !("perm" in t) || canAll).map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-brand font-semibold text-brand" : "border-transparent text-muted-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Card>
        <Table>
          <thead>
            <tr><Th>No.</Th><Th>Request</Th><Th className="text-right">Amount</Th><Th>From</Th><Th>Sent</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/approvals/${r.id}`} className="font-medium text-brand underline">{r.number}</Link></Td>
                <Td>{r.title}</Td>
                <Td className="text-right tabular-nums">{r.amount ? formatMoney(r.amount) : "—"}</Td>
                <Td>{names.get(r.requested_by) ?? "—"}</Td>
                <Td>{formatDate(r.submitted_at, true)}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {requests.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{tab === "waiting" ? "Nothing is waiting for you. 🎉" : "Nothing here yet."}</p>
        )}
      </Card>
    </>
  );
}
