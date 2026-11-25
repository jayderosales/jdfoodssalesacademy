import { Field, Input, Select } from "@/components/ui";

export interface QuizFieldValues {
  title?: string;
  kind?: string;
  module_id?: string | null;
  path_id?: string | null;
  pass_pct?: number;
  max_attempts?: number | null;
  cooldown_hours?: number;
  questions_per_attempt?: number;
  shuffle?: boolean;
  published?: boolean;
}

export function QuizFields({
  q = {},
  modules,
  paths,
}: {
  q?: QuizFieldValues;
  modules: { id: string; label: string }[];
  paths: { id: string; title: string }[];
}) {
  return (
    <>
      <Field label="Title" htmlFor="qtitle">
        <Input id="qtitle" name="title" defaultValue={q.title} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={q.kind ?? "module"}>
            <option value="module">Module quiz</option>
            <option value="certification">Certification exam</option>
            <option value="prehire">Pre-hire assessment (Phase 5)</option>
          </Select>
        </Field>
        <Field label="Module (for module quizzes)" htmlFor="module_id">
          <Select id="module_id" name="module_id" defaultValue={q.module_id ?? ""}>
            <option value="">—</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Learning path (for certification)" htmlFor="path_id" hint="The exam draws from all module quizzes in this path plus its own questions.">
          <Select id="path_id" name="path_id" defaultValue={q.path_id ?? ""}>
            <option value="">—</option>
            {paths.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
        <Field label="Passing score (%)" htmlFor="pass_pct">
          <Input id="pass_pct" name="pass_pct" type="number" min={1} max={100} defaultValue={q.pass_pct ?? 80} />
        </Field>
        <Field label="Questions per attempt" htmlFor="questions_per_attempt" hint="Drawn at random from the approved bank.">
          <Input id="questions_per_attempt" name="questions_per_attempt" type="number" min={1} max={100} defaultValue={q.questions_per_attempt ?? 10} />
        </Field>
        <Field label="Max attempts" htmlFor="max_attempts" hint="Empty = unlimited.">
          <Input id="max_attempts" name="max_attempts" type="number" min={1} defaultValue={q.max_attempts ?? ""} />
        </Field>
        <Field label="Wait after a failed attempt (hours)" htmlFor="cooldown_hours">
          <Input id="cooldown_hours" name="cooldown_hours" type="number" min={0} defaultValue={q.cooldown_hours ?? 0} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shuffle" defaultChecked={q.shuffle ?? true} className="size-4" /> Randomize question and answer order
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={q.published ?? false} className="size-4" /> Published (visible to reps)
      </label>
    </>
  );
}
