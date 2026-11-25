import { requirePermission } from "@/lib/auth";
import { OrgTabs } from "./org-tabs";

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(["org.view", "readonly.all"]);
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Organization</h1>
      <p className="mb-4 text-sm text-muted-foreground">Company structure used by every module: where people work, who reports to whom.</p>
      <OrgTabs />
      {children}
    </>
  );
}
