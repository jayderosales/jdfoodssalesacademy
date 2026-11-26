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
