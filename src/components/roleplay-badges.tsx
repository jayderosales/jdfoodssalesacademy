import { Badge } from "@/components/ui";

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const tone = difficulty === "hard" ? "danger" : difficulty === "medium" ? "warning" : "success";
  return <Badge tone={tone}>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</Badge>;
}

export function ScoreBadge({ overall }: { overall: number | null }) {
  if (overall == null) return null;
  const tone = overall >= 80 ? "success" : overall >= 60 ? "warning" : "danger";
  return <Badge tone={tone}>{Math.round(overall)}/100</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, "neutral" | "brand" | "warning" | "success"]> = {
    active: ["in progress", "brand"],
    ended: ["awaiting score", "warning"],
    graded: ["scored", "success"],
    abandoned: ["abandoned", "neutral"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}
