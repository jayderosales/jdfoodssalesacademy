import { Card, PageHeader } from "@/components/ui";

export function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="text-center">
        <p className="text-sm font-medium">Coming in Phase {phase}</p>
        {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
      </Card>
    </>
  );
}
