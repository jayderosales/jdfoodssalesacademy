import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { TEMPLATES } from "@/lib/import/templates";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import data" };

export default async function ImportPage() {
  await requirePermission(["employees.manage", "admin.org.manage"]);
  const access = await getAccess();
  const allowed = TEMPLATES.filter((t) => can(access, t.perm)).map(({ key, label, description, fields }) => ({ key, label, description, fields }));
  const supabase = await createClient();
  const { data } = await supabase.from("import_jobs").select("id, template, filename, status, total_rows, created_count, updated_count, error, created_at").order("created_at", { ascending: false }).limit(20);
  const jobs = (data as { id: string; template: string; filename: string; status: string; total_rows: number; created_count: number; updated_count: number; error: string; created_at: string }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Import data" description="Bring in records from Excel or CSV. Every row is checked first, and nothing is saved unless the whole file is valid." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {/* fields include zod schemas, which can't cross to the browser: pass only what the wizard displays */}
          <ImportWizard templates={allowed.map((t) => ({ ...t, fields: t.fields.map(({ key, label, required, aliases, example }) => ({ key, label, required, aliases, example, schema: undefined as never })) }))} />
        </Card>
        <Card>
          <CardTitle>Recent imports</CardTitle>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <Table className="min-w-0">
              <thead><tr><Th>File</Th><Th>Result</Th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <Td className="text-xs"><span className="font-medium">{j.filename}</span><div className="text-muted-foreground">{j.template} · {formatDate(j.created_at, true)}</div></Td>
                    <Td className="text-xs">{j.status === "committed" ? `${j.created_count} added, ${j.updated_count} updated` : <span className="text-danger">failed</span>}</Td>
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
