import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { UPCOMING_MODULES } from "@/lib/nav";

export const metadata = { title: "Coming soon" };

/** Placeholder pages for modules on the roadmap (docs/MODULES.md). Visible to role administrators only. */
export default async function UpcomingModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requirePermission("admin.roles.manage");
  const mod = UPCOMING_MODULES.find((m) => m.slug === slug);
  if (!mod) notFound();
  return (
    <>
      <PageHeader title={mod.label} description={`Planned for Phase ${mod.phase}`} />
      <Card>
        <p className="text-sm text-muted-foreground">
          This module isn&apos;t built yet. It&apos;s on the roadmap for Phase {mod.phase} (see docs/plans/phase-plan.md). Only administrators see this
          placeholder.
        </p>
      </Card>
    </>
  );
}
