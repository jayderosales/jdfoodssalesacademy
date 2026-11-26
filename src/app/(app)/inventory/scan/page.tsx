import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { ScanLookup } from "./scan-lookup";

export const metadata = { title: "Scan" };

/** Phone-first item lookup: scan a barcode (or type a SKU) to see stock by location, lot and expiry. */
export default async function ScanPage() {
  await requirePermission("inventory.view");
  return (
    <>
      <PageHeader title="Scan" description="Point your phone camera at a barcode, or type a SKU." />
      <ScanLookup />
    </>
  );
}
