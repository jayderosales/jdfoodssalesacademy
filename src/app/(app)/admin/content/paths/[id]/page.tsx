import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, FileText } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createLesson, createModule, deleteModule, moveLesson, moveModule, updateModule, updatePath } from "../../actions";

export const metadata = { title: "Edit learning path" };

const CATEGORY_LABEL: Record<string, string> = {
  company: "Company",
  product: "Product knowledge",
  customers: "Customer types",
  scripts: "Sales scripts",
  objections: "Objection handling",
  sop: "SOPs",
  general: "General",
};

interface ModuleRow {
  id: string;
  title: string;
  description: string;
  category: string;
  sort: number;
  sequential_unlock: boolean;
  lessons: { id: string; title: string; sort: number; published: boolean; est_minutes: number }[];
}

function MoveButtons({ action, id, extra }: { action: (f: FormData) => Promise<void>; id: string; extra?: Record<string, string> }) {
  return (
    <div className="flex">
      {(["up", "down"] as const).map((dir) => (
        <form key={dir} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="dir" value={dir} />
          {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button className="rounded p-1.5 hover:bg-muted" aria-label={`Move ${dir}`} title={`Move ${dir}`}>
            {dir === "up" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </button>
        </form>
      ))}
    </div>
  );
}

export default async function PathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwner();
  const supabase = await createClient();
  const { data: path } = await supabase.from("learning_paths").select("*").eq("id", id).maybeSingle();
  if (!path) notFound();
  const { data: mods } = await supabase
    .from("modules")
    .select("id, title, description, category, sort, sequential_unlock, lessons(id, title, sort, published, est_minutes)")
    .eq("path_id", id)
    .order("sort");
  const modules = ((mods as ModuleRow[] | null) ?? []).map((m) => ({ ...m, lessons: [...m.lessons].sort((a, b) => a.sort - b.sort) }));

  return (
    <>
      <PageHeader title={path.title} actions={<Link href="/admin/content" className="text-sm text-brand underline">All content</Link>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {modules.map((m, i) => (
            <Card key={m.id}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Module {i + 1} · {CATEGORY_LABEL[m.category] ?? m.category}
                  </p>
                  <h2 className="text-lg font-semibold">{m.title}</h2>
                </div>
                <MoveButtons action={moveModule} id={m.id} />
              </div>

              <ul className="mb-3 divide-y rounded-lg border">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                    <Link href={`/admin/content/lessons/${l.id}`} className="flex-1 text-sm text-brand underline">{l.title}</Link>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{l.est_minutes} min</span>
                    {!l.published && <Badge>draft</Badge>}
                    <MoveButtons action={moveLesson} id={l.id} extra={{ path_id: id }} />
                  </li>
                ))}
                {m.lessons.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No lessons yet.</li>}
              </ul>

              <ActionForm action={createLesson} submitLabel="Add lesson" variant="outline" className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <input type="hidden" name="module_id" value={m.id} />
                <Input name="title" placeholder="New lesson title" aria-label="New lesson title" required />
              </ActionForm>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">Module settings</summary>
                <div className="mt-3 space-y-3">
                  <ActionForm action={updateModule} submitLabel="Save module">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="path_id" value={id} />
                    <ModuleFields m={m} />
                  </ActionForm>
                  <ActionForm action={deleteModule} submitLabel="Delete module" variant="danger" confirm="Delete this module?">
                    <input type="hidden" name="id" value={m.id} />
                  </ActionForm>
                </div>
              </details>
            </Card>
          ))}

          <Card>
            <CardTitle>Add module</CardTitle>
            <ActionForm action={createModule} submitLabel="Add module">
              <input type="hidden" name="path_id" value={id} />
              <ModuleFields />
            </ActionForm>
          </Card>
        </div>

        <Card className="h-fit">
          <CardTitle>Path settings</CardTitle>
          <ActionForm action={updatePath} submitLabel="Save path">
            <input type="hidden" name="id" value={id} />
            <Field label="Title" htmlFor="ptitle">
              <Input id="ptitle" name="title" defaultValue={path.title} required />
            </Field>
            <Field label="Description" htmlFor="pdesc">
              <Textarea id="pdesc" name="description" defaultValue={path.description} rows={3} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={path.published} className="size-4" /> Published (visible to reps)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_default" defaultChecked={path.is_default} className="size-4" /> Default path for every new hire
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

function ModuleFields({ m }: { m?: ModuleRow }) {
  const key = m?.id ?? "new";
  return (
    <>
      <Field label="Module title" htmlFor={`mt-${key}`}>
        <Input id={`mt-${key}`} name="title" defaultValue={m?.title} required />
      </Field>
      <Field label="Description" htmlFor={`md-${key}`}>
        <Textarea id={`md-${key}`} name="description" defaultValue={m?.description} rows={2} />
      </Field>
      <Field label="Category" htmlFor={`mc-${key}`} hint="Used for level requirements (e.g. Level 1 needs company + product modules).">
        <Select id={`mc-${key}`} name="category" defaultValue={m?.category ?? "general"}>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sequential_unlock" defaultChecked={m?.sequential_unlock ?? true} className="size-4" />
        Unlock in order (previous module and lessons must be finished first)
      </label>
    </>
  );
}
