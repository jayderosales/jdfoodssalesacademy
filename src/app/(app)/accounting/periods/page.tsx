import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { importOpening, retryUnposted, setPeriod, startBooks } from "../actions";
import { BooksBanner, monthStart } from "../parts";

export const metadata = { title: "Periods and setup" };

const STATUS_LABEL: Record<string, string> = { open: "Open", closed: "Closed (finance can reopen)", locked: "Locked (final)" };

export default async function PeriodsPage() {
  await requirePermission(["accounting.view", "accounting.periods.manage"]);
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data: periods }, { data: settings }, { data: unposted }] = await Promise.all([
    supabase.from("fiscal_periods").select("id, period_start, status, closed_at").order("period_start", { ascending: false }).limit(36),
    supabase.from("app_settings").select("books_live_from").limit(1).maybeSingle(),
    supabase.from("unposted_events").select("event_id, event_type, error, attempts, last_attempt_at").is("resolved_at", null).order("last_attempt_at", { ascending: false }).limit(100),
  ]);
  const ps = (periods as { id: string; period_start: string; status: string; closed_at: string | null }[] | null) ?? [];
  const live = (settings as { books_live_from: string | null } | null)?.books_live_from ?? null;
  const manage = can(access, "accounting.periods.manage");
  const up = (unposted as { event_id: number; event_type: string; error: string; attempts: number; last_attempt_at: string }[] | null) ?? [];
  const month = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Periods and setup" description="Close each month after it's reviewed so nothing can post into it. Start the official books when the parallel run matches Excel." />
      <BooksBanner />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Months</CardTitle>
            <p className="mb-2 text-sm text-muted-foreground">Open: anything can post. Closed: nothing posts. Finance can reopen it to fix something. Locked: final, after the accountant signs off and VAT is filed.</p>
            <Table>
              <thead><tr><Th>Month</Th><Th>Status</Th>{manage && <Th>Change</Th>}</tr></thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.id}>
                    <Td>{month(p.period_start)}</Td>
                    <Td className={p.status === "open" ? "" : "font-medium"}>{STATUS_LABEL[p.status]}{p.closed_at ? <span className="text-xs text-muted-foreground"> · {formatDate(p.closed_at)}</span> : null}</Td>
                    {manage && (
                      <Td>
                        {p.status !== "locked" && (
                          <div className="flex flex-wrap gap-1">
                            {p.status === "open" && <ActionForm action={setPeriod} submitLabel="Close" variant="outline" className="flex"><input type="hidden" name="month" value={p.period_start} /><input type="hidden" name="status" value="closed" /></ActionForm>}
                            {p.status === "closed" && <ActionForm action={setPeriod} submitLabel="Reopen" variant="outline" className="flex"><input type="hidden" name="month" value={p.period_start} /><input type="hidden" name="status" value="open" /></ActionForm>}
                            <ActionForm action={setPeriod} submitLabel="Lock" variant="danger" className="flex" confirm={`Lock ${month(p.period_start)}? This can't be undone.`}><input type="hidden" name="month" value={p.period_start} /><input type="hidden" name="status" value="locked" /></ActionForm>
                          </div>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {ps.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">Months appear once something posts.</p>}
            {manage && (
              <ActionForm action={setPeriod} submitLabel="Close month" variant="outline" className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                <Field label="Close another month (first day)" htmlFor="month"><Input id="month" name="month" type="date" defaultValue={monthStart()} /></Field>
                <input type="hidden" name="status" value="closed" />
              </ActionForm>
            )}
          </Card>
          <Card>
            <CardTitle>Events that didn&apos;t post ({up.length})</CardTitle>
            {up.length === 0 ? <p className="text-sm text-muted-foreground">Everything posted.</p> : (
              <ul className="divide-y text-sm">
                {up.map((u) => (
                  <li key={u.event_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><b>{u.event_type}</b> #{u.event_id} · {u.error} <span className="text-muted-foreground">({u.attempts} tries, last {formatDate(u.last_attempt_at)})</span></span>
                    {can(access, "accounting.journals.create") && <ActionForm action={retryUnposted} submitLabel="Retry" variant="outline" className="flex"><input type="hidden" name="event_id" value={u.event_id} /></ActionForm>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {manage && (
          <div className="space-y-4">
            <Card>
              <CardTitle>Start the official books</CardTitle>
              {live ? <p className="text-sm">Started {formatDate(live)}. Entries from then on are official.</p> : (
                <>
                  <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Run in parallel with Excel for a month or two and compare the reports.</li>
                    <li>Have the accountant review the chart of accounts, VAT and withholding rates.</li>
                    <li>Choose the start date (usually the first day of a month). Test entries are deleted. Everything from that date posts as official.</li>
                    <li>Import the opening balances from the Excel books as of the day before.</li>
                  </ol>
                  <ActionForm action={startBooks} submitLabel="Start official books" variant="danger" confirm="Delete all test entries and start the official books?">
                    <Field label="Books start on" htmlFor="cutoff"><Input id="cutoff" name="cutoff" type="date" defaultValue={monthStart()} required /></Field>
                    <Field label='Type START to confirm' htmlFor="confirm"><Input id="confirm" name="confirm" autoComplete="off" required /></Field>
                  </ActionForm>
                </>
              )}
            </Card>
            <Card>
              <CardTitle>Opening balances</CardTitle>
              <ActionForm action={importOpening} submitLabel="Post opening balances">
                <Field label="As of" htmlFor="ob-date" hint="The day before the books start."><Input id="ob-date" name="date" type="date" defaultValue={live ? new Date(Date.parse(`${live}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : manilaToday()} required /></Field>
                <Field label="Trial balance from Excel" htmlFor="csv" hint="One line per account: account code, debit, credit. Debits must equal credits. Customer and supplier balances go on their records too (for aging).">
                  <Textarea id="csv" name="csv" rows={8} placeholder={"1010, 25000.00, 0\n1100, 180000.00, 0\n2010, 0, 95000.00\n3010, 0, 110000.00"} required />
                </Field>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
