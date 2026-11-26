import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveSeries } from "../engine-actions";

export const metadata = { title: "Document numbering" };

export default async function NumberingPage() {
  await requirePermission("admin.settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("number_series").select("id, label, prefix, padding, year_reset, number_counters(year, next_value)").order("label");
  const series = (data as { id: string; label: string; prefix: string; padding: number; year_reset: boolean; number_counters: { year: number; next_value: number }[] }[] | null) ?? [];
  const year = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Document numbering"
        description="Numbers never skip: if a document isn't saved, its number isn't used. Counters can't be moved backwards."
        actions={<Link href="/admin/settings" className="text-sm text-brand underline">All settings</Link>}
      />
      <Card>
        <Table>
          <thead><tr><Th>Document</Th><Th>Next number</Th><Th>Format</Th></tr></thead>
          <tbody>
            {series.map((s) => {
              const c = s.number_counters.find((x) => x.year === (s.year_reset ? year : 0));
              const next = `${s.prefix}-${s.year_reset ? `${year}-` : ""}${String(c?.next_value ?? 1).padStart(s.padding, "0")}`;
              return (
                <tr key={s.id}>
                  <Td className="font-medium">{s.label}</Td>
                  <Td className="font-mono text-sm">{next}</Td>
                  <Td>
                    <ActionForm action={saveSeries} submitLabel="Save" variant="outline" className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Prefix" htmlFor={`p-${s.id}`}><Input id={`p-${s.id}`} name="prefix" defaultValue={s.prefix} className="w-24" /></Field>
                      <Field label="Digits" htmlFor={`d-${s.id}`}><Input id={`d-${s.id}`} name="padding" type="number" min={3} max={10} defaultValue={s.padding} className="w-20" /></Field>
                    </ActionForm>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
