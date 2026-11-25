"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { COMPETENCIES, OPTION_IDS, QUESTION_TYPE_LABEL } from "@/lib/quiz/constants";
import { saveQuestion, type FormState } from "../../quizzes/actions";

type QType = keyof typeof QUESTION_TYPE_LABEL;

export interface QuestionValues {
  id?: string;
  quiz_id: string;
  type: QType;
  prompt: string;
  options: { id: string; text: string }[];
  correct: unknown;
  model_answer: string | null;
  explanation: string;
  competency_tag: string | null;
  difficulty: string;
  status: string;
}

export function QuestionForm({ q }: { q: QuestionValues }) {
  const [type, setType] = useState<QType>(q.type);
  const [state, action, pending] = useActionState<FormState, FormData>(saveQuestion, {});
  const correctIds = new Set(Array.isArray(q.correct) ? (q.correct as string[]) : []);
  const optionText = (id: string) => q.options.find((o) => o.id === id)?.text ?? "";

  return (
    <form action={action} className="space-y-4">
      {q.id && <input type="hidden" name="id" value={q.id} />}
      <input type="hidden" name="quiz_id" value={q.quiz_id} />

      <Field label="Question type" htmlFor="type">
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as QType)}>
          {Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>

      <Field
        label={type === "scenario" ? "Scenario" : type === "tf" ? "Statement" : "Question"}
        htmlFor="prompt"
        hint={type === "scenario" ? 'e.g. "A carinderia owner says: \'Mas mura sa iba.\' What do you say?"' : undefined}
      >
        <Textarea id="prompt" name="prompt" defaultValue={q.prompt} rows={3} required />
      </Field>

      {(type === "mcq" || type === "multi") && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">
            Answer options: tick the {type === "mcq" ? "one correct answer" : "correct answers"}
          </legend>
          {OPTION_IDS.map((id, i) => (
            <div key={id} className="flex items-center gap-2">
              <input
                type={type === "mcq" ? "radio" : "checkbox"}
                name="correct"
                value={id}
                defaultChecked={correctIds.has(id)}
                aria-label={`Option ${i + 1} is correct`}
                className="size-5"
              />
              <Input name={`option_${id}`} defaultValue={optionText(id)} placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`} />
            </div>
          ))}
        </fieldset>
      )}

      {type === "tf" && (
        <fieldset className="flex gap-6">
          <legend className="mb-1 text-sm font-medium">The statement is…</legend>
          {["true", "false"].map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="correct_tf" value={v} defaultChecked={String(q.correct) === v} className="size-5" />
              {v === "true" ? "True" : "False"}
            </label>
          ))}
        </fieldset>
      )}

      {(type === "short" || type === "scenario") && (
        <Field label="Model answer" htmlFor="model_answer" hint="The AI grades the rep's answer against these key points. List what a good answer must include.">
          <Textarea id="model_answer" name="model_answer" defaultValue={q.model_answer ?? ""} rows={4} />
        </Field>
      )}

      <Field label="Explanation" htmlFor="explanation" hint="Shown to reps after they submit, when they got it wrong.">
        <Textarea id="explanation" name="explanation" defaultValue={q.explanation} rows={3} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Competency" htmlFor="competency_tag">
          <Select id="competency_tag" name="competency_tag" defaultValue={q.competency_tag ?? ""}>
            <option value="">—</option>
            {COMPETENCIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Difficulty" htmlFor="difficulty">
          <Select id="difficulty" name="difficulty" defaultValue={q.difficulty}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" hint="Only approved questions appear in quizzes.">
          <Select id="status" name="status" defaultValue={q.status}>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </div>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save question"}</Button>
    </form>
  );
}
