import Link from "next/link";
import { BookOpen, ListChecks, MessageSquare, Package } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPath } from "./actions";

export const metadata = { title: "Content" };

export default async function ContentPage() {
  await requireOwner();
  const supabase = await createClient();
  const [{ data: paths }, { count: products }, { count: unverified }, { count: quizzes }, { count: drafts }, { count: scenarios }] = await Promise.all([
    supabase.from("learning_paths").select("id, title, description, published, is_default, modules(id, lessons(id))").order("created_at"),
    supabase.from("academy_products").select("id", { count: "exact", head: true }),
    supabase.from("academy_products").select("id", { count: "exact", head: true }).eq("verified", false),
    supabase.from("quizzes").select("id", { count: "exact", head: true }),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("scenarios").select("id", { count: "exact", head: true }),
  ]);

  type PathRow = { id: string; title: string; description: string; published: boolean; is_default: boolean; modules: { id: string; lessons: { id: string }[] }[] };

  return (
    <>
      <PageHeader title="Content" description="Everything reps learn is edited here. Nothing is hard-coded." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href="/admin/content/scenarios">
          <Card className="h-full hover:border-brand">
            <div className="flex items-center gap-3">
              <MessageSquare className="size-6 text-brand" aria-hidden />
              <div>
                <p className="font-semibold">Roleplay scenarios</p>
                <p className="text-sm text-muted-foreground">{scenarios ?? 0} scenarios for AI practice</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/content/products">
          <Card className="h-full hover:border-brand">
            <div className="flex items-center gap-3">
              <Package className="size-6 text-brand" aria-hidden />
              <div>
                <p className="font-semibold">Products</p>
                <p className="text-sm text-muted-foreground">
                  {products ?? 0} products{unverified ? ` · ${unverified} still unverified placeholders` : ""}
                </p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/content/quizzes">
          <Card className="h-full hover:border-brand">
            <div className="flex items-center gap-3">
              <ListChecks className="size-6 text-brand" aria-hidden />
              <div>
                <p className="font-semibold">Quizzes &amp; question bank</p>
                <p className="text-sm text-muted-foreground">
                  {quizzes ?? 0} quizzes{drafts ? ` · ${drafts} draft questions awaiting review` : ""}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Learning paths</CardTitle>
          <ul className="divide-y">
            {((paths as PathRow[] | null) ?? []).map((p) => {
              const lessons = p.modules.reduce((s, m) => s + m.lessons.length, 0);
              return (
                <li key={p.id} className="py-3">
                  <Link href={`/admin/content/paths/${p.id}`} className="flex items-start gap-3">
                    <BookOpen className="mt-0.5 size-5 text-brand" aria-hidden />
                    <div className="flex-1">
                      <p className="font-medium text-brand underline">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.modules.length} modules · {lessons} lessons
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {p.is_default && <Badge tone="brand">default</Badge>}
                      <Badge tone={p.published ? "success" : "neutral"}>{p.published ? "published" : "draft"}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {!paths?.length && <p className="text-sm text-muted-foreground">No learning paths yet.</p>}
        </Card>
        <Card>
          <CardTitle>New learning path</CardTitle>
          <ActionForm action={createPath} submitLabel="Create path">
            <Field label="Title" htmlFor="title">
              <Input id="title" name="title" required placeholder="e.g. Distributor Onboarding" />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={3} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
