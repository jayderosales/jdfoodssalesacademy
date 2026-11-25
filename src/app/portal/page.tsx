import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Portal" };

const LABEL: Record<string, string> = { customer: "Customer", distributor: "Distributor", supplier: "Supplier", staff: "" };

/** Placeholder for the customer / distributor / supplier portals (Phase 7). */
export default async function PortalPage() {
  const profile = await requireUser({ allowExternal: true, skipConsent: true });
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <div className="mb-3 flex justify-center"><Logo size={48} /></div>
        <h1 className="mb-2 text-lg font-bold">Welcome{profile.company_name ? `, ${profile.company_name}` : ""}!</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Your {LABEL[profile.account_type].toLowerCase() || "portal"} account is approved. Online ordering, invoices and order tracking will open
          here soon. For now, please contact your JD Foods account manager for orders.
        </p>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-brand underline">Sign out</button>
        </form>
      </Card>
    </main>
  );
}
