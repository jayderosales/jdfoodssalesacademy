"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Alert, Button, Field, Input, Select, Table, Td, Th, buttonVariants } from "@/components/ui";
import { autoMap, type ImportTemplate, type RowResult } from "@/lib/import/templates";
import { commitImport, parseImportFile, validateImport } from "./actions";

type Step = "upload" | "map" | "review" | "done";

/** Upload → map columns → review (row errors) → import all-or-nothing. */
export function ImportWizard({ templates }: { templates: Pick<ImportTemplate, "key" | "label" | "description" | "fields">[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [file, setFile] = useState<{ filename: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [results, setResults] = useState<RowResult[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);
  const [pending, start] = useTransition();
  const template = templates.find((t) => t.key === templateKey)!;
  const bad = results.filter((r) => r.errors.length);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setResults([]);
    setError("");
    setDone(null);
  };

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs">
        {["1. Upload", "2. Match columns", "3. Review", "4. Done"].map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${["upload", "map", "review", "done"].indexOf(step) >= i ? "bg-brand text-white" : "bg-muted"}`}>{s}</li>
        ))}
      </ol>
      {error && <Alert tone="danger">{error}</Alert>}

      {step === "upload" && (
        <form
          className="space-y-4"
          action={(form) =>
            start(async () => {
              setError("");
              const res = await parseImportFile(form);
              if (res.error || !res.headers || !res.rows) return setError(res.error ?? "Couldn't read the file.");
              setFile({ filename: res.filename!, headers: res.headers, rows: res.rows });
              setMapping(autoMap(template as ImportTemplate, res.headers));
              setStep("map");
            })
          }
        >
          <Field label="What are you importing?" htmlFor="template">
            <Select id="template" name="template" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-muted-foreground">{template.description}</p>
          <a href={`/api/import-template/${template.key}`} className={buttonVariants({ variant: "outline" })}>
            <Download className="size-4" aria-hidden /> Download a blank template
          </a>
          <Field label="Your file (.xlsx or .csv)" htmlFor="file">
            <Input id="file" name="file" type="file" accept=".xlsx,.csv,.txt" required />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Reading…" : "Next: match columns"}</Button>
        </form>
      )}

      {step === "map" && file && (
        <div className="space-y-4">
          <p className="text-sm">
            <strong>{file.filename}</strong>: {file.rows.length} rows. Choose which column in your file holds each field. We guessed where we could.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {template.fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} htmlFor={`m-${f.key}`}>
                <Select id={`m-${f.key}`} value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>— Not in my file —</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>{h}{file.rows[0]?.[i] ? ` (e.g. ${file.rows[0][i].slice(0, 30)})` : ""}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const res = await validateImport(template.key, file.rows, mapping);
                  if (res.error || !res.results) return setError(res.error ?? "Couldn't check the rows.");
                  setResults(res.results);
                  setStep("review");
                })
              }
            >
              {pending ? "Checking…" : "Next: check rows"}
            </Button>
            <Button variant="outline" onClick={reset}>Start over</Button>
          </div>
        </div>
      )}

      {step === "review" && file && (
        <div className="space-y-4">
          {bad.length ? (
            <Alert tone="danger">
              {bad.length} of {results.length} rows have problems. Nothing has been imported. Fix them in your file and upload it again.
            </Alert>
          ) : (
            <Alert tone="success">All {results.length} rows look good. Importing adds new records and updates existing ones, all at once.</Alert>
          )}
          {bad.length > 0 && (
            <Table>
              <thead><tr><Th>Row</Th><Th>Problems</Th></tr></thead>
              <tbody>
                {bad.slice(0, 200).map((r) => (
                  <tr key={r.row}>
                    <Td>{r.row + 1}</Td>
                    <Td className="text-sm text-danger">{r.errors.join(" · ")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <details open={!bad.length}>
            <summary className="cursor-pointer text-sm font-medium">Preview (first 20 rows)</summary>
            <Table>
              <thead><tr>{template.fields.map((f) => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
              <tbody>
                {results.slice(0, 20).map((r) => (
                  <tr key={r.row} className={r.errors.length ? "bg-danger/5" : ""}>
                    {template.fields.map((f) => <Td key={f.key} className="text-xs">{String(r.values[f.key] ?? "")}</Td>)}
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
          <div className="flex gap-2">
            {!bad.length && (
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError("");
                    const res = await commitImport(template.key, file.filename, file.rows, mapping);
                    if (res.error) return setError(res.error);
                    setDone({ created: res.created ?? 0, updated: res.updated ?? 0 });
                    setStep("done");
                  })
                }
              >
                {pending ? "Importing…" : `Import ${results.length} rows`}
              </Button>
            )}
            <Button variant="outline" onClick={reset}>Upload a different file</Button>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <div className="space-y-3">
          <Alert tone="success">Imported: {done.created} added, {done.updated} updated. Every change is in the audit log.</Alert>
          <Button variant="outline" onClick={reset}>Import another file</Button>
        </div>
      )}
    </div>
  );
}
