import { Badge } from "@/components/ui";

type Tone = "neutral" | "brand" | "success" | "danger" | "warning";

/** Consistent colours and wording for document statuses across every module. */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Waiting for approval", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
  waiting: { label: "Not yet", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  returned: { label: "Returned for changes", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  on_leave: { label: "On leave", tone: "warning" },
  // sales orders
  credit_review: { label: "Credit review", tone: "warning" },
  awaiting_payment: { label: "Waiting for payment", tone: "warning" },
  confirmed: { label: "Paid / released", tone: "brand" },
  packing: { label: "Packing", tone: "brand" },
  ready_for_pickup: { label: "Ready for pickup", tone: "success" },
  dispatched: { label: "With courier", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  issued: { label: "Issued", tone: "success" },
  void: { label: "Void", tone: "neutral" },
  spoiled: { label: "Spoiled", tone: "neutral" },
  used_up: { label: "Used up", tone: "neutral" },
  // leads
  new: { label: "New", tone: "brand" },
  contacted: { label: "Contacted", tone: "neutral" },
  qualified: { label: "Qualified", tone: "brand" },
  proposal: { label: "Proposal", tone: "warning" },
  negotiation: { label: "Negotiation", tone: "warning" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};

export function statusLabel(status: string) {
  return STATUS[status]?.label ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" as Tone };
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}
