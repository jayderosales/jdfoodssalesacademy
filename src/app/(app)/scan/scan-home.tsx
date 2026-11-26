import Link from "next/link";
import { ScanCapture } from "@/components/shared/scan-capture";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { KIND_INFO, SCAN_KINDS, type ScanKind } from "@/lib/scan/kinds";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const STATUS: Record<string, string> = { reading: "Reading…", ready: "Ready to check", failed: "Couldn't read, type it in", done: "Saved", discarded: "Discarded" };

/** "Scan a document" screen, shown under Inventory and Accounting (each limited to its own document types) and at /scan. */
export async function ScanHome({ section, kind }: { section: "inventory" | "accounting" | null; kind?: string }) {
  const me = await requireUser();
  const access = await getAccess();
  const allowed = SCAN_KINDS.filter((k) => !KIND_INFO[k].perm || can(access, KIND_INFO[k].perm)).filter((k) => !section || KIND_INFO[k].section === section);
  const supabase = await createClient();
  const { data } = await supabase.from("document_scans").select("id, kind, status, filename, created_at, created_by").order("created_at", { ascending: false }).limit(50);
  const scans = ((data as { id: string; kind: ScanKind; status: string; filename: string; created_at: string; created_by: string }[] | null) ?? []).filter((s) => !section || KIND_INFO[s.kind].section === section);
  const title = section === "inventory" ? "Scan an inventory document" : section === "accounting" ? "Scan an accounting document" : "Scan a document";

  return (
    <>
      <PageHeader title={title} description="Take a photo of a paper document. The system reads it and fills in a form for you to check. Nothing is saved until you confirm." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle>New scan</CardTitle>
          {allowed.length ? <ScanCapture kinds={allowed} defaultKind={kind as ScanKind | undefined} /> : <p className="text-sm text-muted-foreground">You don&apos;t have permission to enter these documents.</p>}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Recent scans</CardTitle>
          {scans.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scanned yet.</p> : (
            <Table>
              <thead><tr><Th>Document</Th><Th>Status</Th></tr></thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id}>
                    <Td><Link href={`/scan/${s.id}`} className="font-medium text-brand underline">{KIND_INFO[s.kind].label}</Link><div className="text-xs text-muted-foreground">{formatDate(s.created_at)}{s.created_by !== me.id ? " · by someone else" : ""}</div></Td>
                    <Td className={s.status === "ready" || s.status === "failed" ? "font-medium text-amber-700" : "text-muted-foreground"}>{STATUS[s.status]}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
