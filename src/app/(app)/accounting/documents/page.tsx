import { ScanHome } from "../../scan/scan-home";

export const metadata = { title: "Scan an accounting document" };

export default async function AccountingDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ScanHome section="accounting" kind={(await searchParams).kind} />;
}
