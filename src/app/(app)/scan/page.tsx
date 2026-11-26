import { redirect } from "next/navigation";
import { KIND_INFO, SCAN_KINDS, type ScanKind } from "@/lib/scan/kinds";
import { ScanHome } from "./scan-home";

export const metadata = { title: "Scan a document" };

/**
 * Generic entry (used by links from petty cash and transmittals, which staff outside Inventory/Accounting use).
 * Links with a kind of an inventory document go to the Inventory tab.
 */
export default async function ScanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const kind = SCAN_KINDS.includes(sp.kind as ScanKind) ? (sp.kind as ScanKind) : undefined;
  if (sp.section === "inventory" || (kind && KIND_INFO[kind].section === "inventory")) redirect(`/inventory/documents${kind ? `?kind=${kind}` : ""}`);
  if (sp.section === "accounting") redirect(`/accounting/documents${kind ? `?kind=${kind}` : ""}`);
  return <ScanHome section={null} kind={kind} />;
}
