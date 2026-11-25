import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import type { Persona } from "@/lib/ai/prompts/customer";
import { createClient } from "@/lib/supabase/server";
import { saveScenario } from "../actions";

export const metadata = { title: "Edit scenario" };

interface ScenarioRow {
  id?: string;
  title: string;
  briefing: string;
  customer_opening: string | null;
  goal: string;
  difficulty: string;
  language: string;
  max_turns: number;
  rubric_id: string | null;
  product_ids: string[];
  active: boolean;
  persona: Persona;
}

const EMPTY: ScenarioRow = {
  title: "", briefing: "", customer_opening: null, goal: "", difficulty: "easy", language: "taglish", max_turns: 14, rubric_id: null, product_ids: [], active: true,
  persona: { name: "", business_type: "", location: "", personality: "", budget: "", current_supplier: "", hidden_needs: "", objections: [] },
};

export default async function ScenarioEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwner();
  const supabase = await createClient();
  let s = EMPTY;
  if (id !== "new") {
    const { data } = await supabase.from("scenarios").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    s = data as ScenarioRow;
  }
  const [{ data: products }, { data: rubrics }] = await Promise.all([
    supabase.from("products").select("id, name, brand, verified").eq("active", true).order("brand").order("name"),
    supabase.from("rubrics").select("id, name, version").order("created_at"),
  ]);
  const p = s.persona;

  return (
    <>
      <PageHeader
        title={id === "new" ? "Add scenario" : s.title}
        actions={<Link href="/admin/content/scenarios" className="text-sm text-brand underline">All scenarios</Link>}
      />
      <ActionForm action={saveScenario} submitLabel="Save scenario" className="space-y-4">
        {s.id && <input type="hidden" name="id" value={s.id} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <CardTitle>What the rep sees</CardTitle>
            <Field label="Title" htmlFor="title"><Input id="title" name="title" defaultValue={s.title} required /></Field>
            <Field label="Briefing" htmlFor="briefing" hint="The situation, shown to the rep before and during the chat.">
              <Textarea id="briefing" name="briefing" defaultValue={s.briefing} rows={3} required />
            </Field>
            <Field label="Rep's goal" htmlFor="goal" hint="e.g. Get a trial order of 2 flavors, or book a sampling visit.">
              <Input id="goal" name="goal" defaultValue={s.goal} required />
            </Field>
            <Field label="Customer's first line (optional)" htmlFor="customer_opening" hint="Use when the customer speaks first (e.g. answers the phone, or calls in to complain). Otherwise the rep starts.">
              <Textarea id="customer_opening" name="customer_opening" defaultValue={s.customer_opening ?? ""} rows={2} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Difficulty" htmlFor="difficulty">
                <Select id="difficulty" name="difficulty" defaultValue={s.difficulty}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </Select>
              </Field>
              <Field label="Language" htmlFor="language">
                <Select id="language" name="language" defaultValue={s.language}>
                  <option value="taglish">Taglish</option><option value="en">English</option>
                </Select>
              </Field>
              <Field label="Max rep turns" htmlFor="max_turns">
                <Input id="max_turns" name="max_turns" type="number" min={2} max={40} defaultValue={s.max_turns} />
              </Field>
            </div>
            <Field label="Scoring rubric" htmlFor="rubric_id">
              <Select id="rubric_id" name="rubric_id" defaultValue={s.rubric_id ?? ""}>
                <option value="">Default</option>
                {(rubrics ?? []).map((r: { id: string; name: string; version: number }) => <option key={r.id} value={r.id}>{r.name} (v{r.version})</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={s.active} className="size-4" /> Active (reps can practice it)
            </label>
          </Card>

          <Card className="space-y-3">
            <CardTitle>Customer persona (hidden from reps)</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={p.name} required placeholder="e.g. Aling Nena" /></Field>
              <Field label="Business type" htmlFor="business_type"><Input id="business_type" name="business_type" defaultValue={p.business_type} required /></Field>
              <Field label="Location" htmlFor="location"><Input id="location" name="location" defaultValue={p.location} required /></Field>
              <Field label="Budget" htmlFor="budget"><Input id="budget" name="budget" defaultValue={p.budget} /></Field>
            </div>
            <Field label="Personality" htmlFor="personality"><Textarea id="personality" name="personality" defaultValue={p.personality} rows={2} required /></Field>
            <Field label="Current supplier / what they use now" htmlFor="current_supplier"><Textarea id="current_supplier" name="current_supplier" defaultValue={p.current_supplier} rows={2} /></Field>
            <Field label="Hidden needs" htmlFor="hidden_needs" hint="Revealed only if the rep asks good questions.">
              <Textarea id="hidden_needs" name="hidden_needs" defaultValue={p.hidden_needs} rows={2} />
            </Field>
            <Field label="Objections to raise (one per line)" htmlFor="objections">
              <Textarea id="objections" name="objections" defaultValue={p.objections.join("\n")} rows={4} />
            </Field>
            <Field label="Other notes for the AI (optional)" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={p.notes ?? ""} rows={2} /></Field>
          </Card>
        </div>

        <Card>
          <CardTitle>Products in this scenario</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">Their facts are given to the AI customer and grader so wrong claims get caught. Only verified fields are used as fact.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(products ?? []).map((pr: { id: string; name: string; brand: string; verified: boolean }) => (
              <label key={pr.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="product_ids" value={pr.id} defaultChecked={s.product_ids.includes(pr.id)} className="size-4" />
                {pr.name}{!pr.verified && <span className="text-xs text-muted-foreground">(placeholder)</span>}
              </label>
            ))}
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
