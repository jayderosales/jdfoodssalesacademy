"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Textarea } from "@/components/ui";
import { submitAttempt, type FormState } from "../../actions";

export interface TakeQuestion {
  id: string;
  type: "mcq" | "multi" | "tf" | "short" | "scenario";
  prompt: string;
  options: { id: string; text: string }[]; // already in display order
}

type Answer = string | string[] | boolean;

/** Answers are kept in localStorage so a dropped connection or reload doesn't lose them. */
export function TakeQuiz({ attemptId, questions }: { attemptId: string; questions: TakeQuestion[] }) {
  const storageKey = `quiz-attempt-${attemptId}`;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [state, action, pending] = useActionState<FormState, FormData>(submitAttempt, {});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setAnswers(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  const set = (qid: string, value: Answer) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const answered = questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0);
  }).length;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (answered < questions.length && !window.confirm(`You answered ${answered} of ${questions.length}. Submit anyway?`)) e.preventDefault();
        else
          try {
            localStorage.removeItem(storageKey);
          } catch {}
      }}
      className="space-y-4"
    >
      <input type="hidden" name="attempt_id" value={attemptId} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <fieldset>
              <legend className="mb-3 font-medium">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                <span className="whitespace-pre-line">{q.prompt}</span>
                {q.type === "multi" && <span className="mt-1 block text-xs font-normal text-muted-foreground">Select all that apply.</span>}
              </legend>

              {q.type === "mcq" &&
                q.options.map((o) => (
                  <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === o.id} onChange={() => set(q.id, o.id)} className="size-5 shrink-0" />
                    <span className="text-sm">{o.text}</span>
                  </label>
                ))}

              {q.type === "multi" &&
                q.options.map((o) => {
                  const cur = (answers[q.id] as string[] | undefined) ?? [];
                  return (
                    <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={cur.includes(o.id)}
                        onChange={(e) => set(q.id, e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id))}
                        className="size-5 shrink-0"
                      />
                      <span className="text-sm">{o.text}</span>
                    </label>
                  );
                })}

              {q.type === "tf" && (
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map((v) => (
                    <label key={String(v)} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border ${answers[q.id] === v ? "border-brand bg-brand/5 font-semibold" : ""}`}>
                      <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === v} onChange={() => set(q.id, v)} className="sr-only" />
                      {v ? "True" : "False"}
                    </label>
                  ))}
                </div>
              )}

              {(q.type === "short" || q.type === "scenario") && (
                <Textarea
                  aria-label={`Answer to question ${i + 1}`}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => set(q.id, e.target.value)}
                  rows={q.type === "scenario" ? 5 : 3}
                  maxLength={4000}
                  placeholder={q.type === "scenario" ? "Write exactly what you would say to the customer…" : "Your answer"}
                />
              )}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="sticky bottom-16 z-20 rounded-xl border bg-card p-3 shadow-lg md:bottom-4">
        <div className="mb-2 flex justify-between text-sm">
          <span>Answered {answered} of {questions.length}</span>
          {pending && <span className="text-muted-foreground">Grading…</span>}
        </div>
        {state.error && <div className="mb-2"><Alert tone="danger">{state.error}</Alert></div>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Submitting… (written answers take a few seconds)" : "Submit answers"}
        </Button>
      </div>
    </form>
  );
}
