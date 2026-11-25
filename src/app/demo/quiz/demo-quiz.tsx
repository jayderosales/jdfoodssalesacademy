"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { demoQuiz } from "../data";

type Answer = string | boolean;

/** Client-only quiz demo: grades the two objective questions locally; the scenario shows sample AI feedback. */
export function DemoQuiz() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);

  const correct = (q: (typeof demoQuiz)[number]) => (q.type === "scenario" ? true : answers[q.id] === q.correct);
  const points = demoQuiz.reduce((s, q) => s + (q.type === "scenario" ? ((answers[q.id] as string)?.trim() ? 1 : 0) : correct(q) ? 1 : 0), 0);
  const score = Math.round((points / demoQuiz.length) * 10000) / 100;

  if (submitted) {
    return (
      <div className="space-y-3">
        <Card className="text-center">
          <p className="text-5xl font-bold text-brand">{score}%</p>
          <p className="mt-2">{score >= 80 ? <Badge tone="success">Passed: nice work!</Badge> : <Badge tone="danger">Not passed yet (need 80%)</Badge>}</p>
        </Card>
        {demoQuiz.map((q, i) => {
          const ok = q.type === "scenario" ? !!(answers[q.id] as string)?.trim() : correct(q);
          const Icon = ok ? CheckCircle2 : q.type === "scenario" ? CircleAlert : XCircle;
          return (
            <Card key={q.id}>
              <div className="flex gap-3">
                <Icon className={`mt-0.5 size-5 shrink-0 ${ok ? "text-success" : "text-danger"}`} aria-hidden />
                <div className="flex-1 space-y-2 text-sm">
                  <p className="font-medium"><span className="mr-1 text-muted-foreground">{i + 1}.</span>{q.prompt}</p>
                  {q.type === "scenario" && ok && <p className="rounded-lg bg-muted px-3 py-2">{q.aiFeedback} <span className="text-xs text-muted-foreground">(sample AI feedback)</span></p>}
                  {!ok && <p className="rounded-lg border-l-4 border-brand-2 bg-brand-2/5 px-3 py-2"><strong>Explanation: </strong>{q.explanation}</p>}
                </div>
              </div>
            </Card>
          );
        })}
        <Button variant="outline" onClick={() => { setAnswers({}); setSubmitted(false); }}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {demoQuiz.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <legend className="sr-only">Question {i + 1}</legend>
          <p className="mb-3 font-medium"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{q.prompt}</p>
          {q.type === "mcq" &&
            q.options.map((o) => (
              <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                <input type="radio" name={q.id} checked={answers[q.id] === o.id} onChange={() => setAnswers({ ...answers, [q.id]: o.id })} className="size-5" />
                <span className="text-sm">{o.text}</span>
              </label>
            ))}
          {q.type === "tf" && (
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <label key={String(v)} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border ${answers[q.id] === v ? "border-brand bg-brand/5 font-semibold" : ""}`}>
                  <input type="radio" name={q.id} className="sr-only" checked={answers[q.id] === v} onChange={() => setAnswers({ ...answers, [q.id]: v })} />
                  {v ? "True" : "False"}
                </label>
              ))}
            </div>
          )}
          {q.type === "scenario" && (
            <Textarea rows={4} placeholder="Write exactly what you would say to the customer…" value={(answers[q.id] as string) ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} aria-label="Your answer" />
          )}
        </fieldset>
      ))}
      <div className="sticky bottom-16 z-20 rounded-xl border bg-card p-3 shadow-lg md:bottom-4">
        <p className="mb-2 text-sm">Answered {Object.values(answers).filter((a) => a !== "").length} of {demoQuiz.length}</p>
        <Button size="lg" className="w-full" onClick={() => setSubmitted(true)}>Submit answers</Button>
      </div>
    </div>
  );
}
