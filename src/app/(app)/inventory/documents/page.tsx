import { ScanHome } from "../../scan/scan-home";

export const metadata = { title: "Scan an inventory document" };

export default async function InventoryDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ScanHome section="inventory" kind={(await searchParams).kind} />;
}
