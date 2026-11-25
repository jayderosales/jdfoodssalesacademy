import { BookOpen, ListChecks, MessageSquare, Package } from "lucide-react";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";

export const metadata = { title: "Owner view" };

const STATS = [
  ["Avg. time to Field Ready", "18 days", "target 30"],
  ["Quiz pass rate", "84%", "first attempt 71%"],
  ["Roleplays this month", "146", "avg score 68"],
  ["AI cost this month", "$41.20", "≈ ₱2,400"],
] as const;

export default function DemoOwner() {
  return (
    <>
      <PageHeader title="Owner view" description="Company overview and content management." />
      <div className="mb-4"><Alert>Company dashboard numbers are Phase 4 features, shown here as samples. The content area below is how the real Content page looks.</Alert></div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(([label, value, sub]) => (
          <Card key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-brand">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Content</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          [MessageSquare, "Roleplay scenarios", "8 scenarios for AI practice"],
          [Package, "Products", "16 products · 16 still unverified placeholders"],
          [ListChecks, "Quizzes & question bank", "7 quizzes · 50 approved questions"],
        ].map(([Icon, title, sub]) => {
          const I = Icon as typeof Package;
          return (
            <Card key={title as string}>
              <div className="flex items-center gap-3">
                <I className="size-6 text-brand" aria-hidden />
                <div><p className="font-semibold">{title as string}</p><p className="text-sm text-muted-foreground">{sub as string}</p></div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardTitle>Learning paths</CardTitle>
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 size-5 text-brand" aria-hidden />
          <div className="flex-1">
            <p className="font-medium text-brand underline">New Hire Onboarding</p>
            <p className="text-xs text-muted-foreground">6 modules · 37 lessons</p>
          </div>
          <Badge tone="brand">default</Badge>
          <Badge tone="success">published</Badge>
        </div>
      </Card>
    </>
  );
}
