"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that here.";
  if (/duplicate key/.test(msg)) return "That already exists.";
  if (/violates (check|foreign key|not-null)/.test(msg)) {
    console.error("accounting", msg);
    return "Some details aren't valid. Please check the form.";
  }
  return msg;
}
const fail = (e: { message: string }) => ({ error: friendly(e.message) });
async function rpc(fn: string, args: Record<string, unknown>, paths: string[], ok: string | ((d: unknown) => string)): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fail(error);
  paths.forEach((p) => revalidatePath(p));
  return { message: typeof ok === "function" ? ok(data) : ok };
}

// ================================================================ chart of accounts
export async function saveAccount(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.coa.manage");
  const v = z
    .object({
      id: z.preprocess((x) => (x === "" || x == null ? null : x), uuid.nullable()),
      code: z.string().regex(/^[0-9]{4,6}$/, "Account code: 4 to 6 digits."),
      name: z.string().trim().min(2, "Enter the account name.").max(120),
      type: z.enum(["asset", "liability", "equity", "income", "expense"]),
      subtype: text(40),
      is_header: z.preprocess((x) => x === "on", z.boolean()),
      active: z.preprocess((x) => x === "on", z.boolean()),
      description: text(300),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { id, ...rest } = v.data;
  const { error } = id
    ? await supabase.from("accounts").update({ ...rest, needs_verification: false }).eq("id", id)
    : await supabase.from("accounts").insert({ ...rest, needs_verification: false });
  if (error) return fail(error);
  revalidatePath("/accounting/accounts");
  return { message: id ? "Account saved." : "Account added." };
}

export async function setMethodAccount(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.coa.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("payment_method_accounts").upsert({ method: String(form.get("method")), account_id: uuid.parse(form.get("account_id")) });
  if (error) return fail(error);
  revalidatePath("/accounting/accounts");
  return { message: "Saved." };
}

// ================================================================ manual journals
export async function createJournal(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const v = z.object({ entry_date: date, memo: z.string().trim().min(3, "Describe the entry.").max(300) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("journal_entries").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return fail(error);
  redirect(`/accounting/journals/${(data as { id: string }).id}`);
}

export async function addJournalLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const v = z
    .object({
      entry_id: uuid,
      account_id: uuid,
      side: z.enum(["debit", "credit"]),
      amount: z.preprocess((x) => parseMoney(String(x ?? "")), z.string({ message: "Enter a valid amount." })),
      description: text(200),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  if (Number(v.data.amount) <= 0) return { error: "Amount must be more than zero." };
  const supabase = await createClient();
  const { error } = await supabase.from("journal_lines").insert({
    entry_id: v.data.entry_id, account_id: v.data.account_id, description: v.data.description,
    debit: v.data.side === "debit" ? v.data.amount : 0, credit: v.data.side === "credit" ? v.data.amount : 0,
  });
  if (error) return fail(error);
  revalidatePath(`/accounting/journals/${v.data.entry_id}`);
  return {};
}

export async function removeJournalLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const supabase = await createClient();
  const { error } = await supabase.from("journal_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath(`/accounting/journals/${uuid.parse(form.get("entry_id"))}`);
  return {};
}

export async function submitJournal(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const id = uuid.parse(form.get("id"));
  return rpc("submit_journal", { p_entry: id }, [`/accounting/journals/${id}`, "/accounting/journals"], "Sent to the CEO for approval.");
}

export async function reverseJournal(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const id = uuid.parse(form.get("id"));
  const d = date.safeParse(form.get("date"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_journal", { p_entry: id, p_date: d.success ? d.data : null, p_reason: String(form.get("reason") ?? "") });
  if (error) return fail(error);
  redirect(`/accounting/journals/${data as string}`);
}

export async function deleteDraftJournal(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const supabase = await createClient();
  const { error } = await supabase.from("journal_entries").delete().eq("id", uuid.parse(form.get("id"))).eq("status", "draft");
  if (error) return fail(error);
  redirect("/accounting/journals");
}

export async function retryUnposted(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const ev = form.get("event_id");
  return rpc("retry_unposted", { p_event: ev ? Number(ev) : null }, ["/accounting", "/accounting/periods"], (n) => `${n} event(s) posted.`);
}

// ================================================================ periods and go-live
export async function setPeriod(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.periods.manage");
  return rpc("close_period", { p_month: String(form.get("month")), p_status: String(form.get("status")) }, ["/accounting/periods"], "Period updated.");
}

export async function startBooks(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.periods.manage");
  if (String(form.get("confirm")).trim().toUpperCase() !== "START") return { error: 'Type START to confirm.' };
  return rpc("start_books", { p_cutoff: String(form.get("cutoff")) }, ["/accounting", "/accounting/periods"], (n) => `The books start now. ${n} test entries were removed.`);
}

/** Opening balances pasted as CSV: account code, debit, credit (one line per account). */
export async function importOpening(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.periods.manage");
  const d = date.safeParse(form.get("date"));
  if (!d.success) return { error: "Enter the opening balance date (the day before the books start)." };
  const lines: { account: string; debit: string; credit: string }[] = [];
  const bad: number[] = [];
  String(form.get("csv") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^account/i.test(l))
    .forEach((l, i) => {
      const [code, dr, cr] = l.split(/[,\t;]/).map((x) => x.trim());
      const debit = parseMoney(dr || "0");
      const credit = parseMoney(cr || "0");
      if (!/^[0-9]{4,6}$/.test(code ?? "") || debit == null || credit == null) bad.push(i + 1);
      else lines.push({ account: code, debit, credit });
    });
  if (bad.length) return { error: `Check line(s) ${bad.slice(0, 10).join(", ")}: each line is "account code, debit, credit".` };
  if (!lines.length) return { error: "Paste the opening trial balance." };
  return rpc("import_opening_balances", { p_date: d.data, p_lines: lines }, ["/accounting", "/accounting/periods", "/accounting/reports"], "Opening balances posted.");
}

// ================================================================ supplier payments
export async function createSupplierPayment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("ap.payments.create");
  const v = z.object({ supplier_id: uuid, account_id: uuid, method: z.enum(["bank_transfer", "cheque", "cash", "gcash", "maya", "other"]), pay_date: date, notes: text(300) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose the supplier, the account to pay from and the date." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_payments").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return fail(error);
  const pid = (data as { id: string }).id;
  // add every ready-to-pay invoice of this supplier in full
  const { data: invs } = await supabase.from("supplier_invoices").select("id, total, paid_amount").eq("supplier_id", v.data.supplier_id).in("status", ["matched", "approved"]);
  for (const i of (invs as { id: string; total: string; paid_amount: string }[] | null) ?? []) {
    const open = Number(i.total) - Number(i.paid_amount);
    if (open > 0) await supabase.from("supplier_payment_lines").insert({ payment_id: pid, invoice_id: i.id, amount: open.toFixed(2) });
  }
  redirect(`/accounting/payables/${pid}`);
}

export async function updatePaymentLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("ap.payments.create");
  const id = uuid.parse(form.get("id"));
  const pid = uuid.parse(form.get("payment_id"));
  const amount = parseMoney(String(form.get("amount") ?? ""));
  const supabase = await createClient();
  const { error } = amount && Number(amount) > 0
    ? await supabase.from("supplier_payment_lines").update({ amount }).eq("id", id)
    : await supabase.from("supplier_payment_lines").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/accounting/payables/${pid}`);
  return {};
}

export async function paymentAction(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("ap.payments.create");
  const id = uuid.parse(form.get("id"));
  const paths = [`/accounting/payables/${id}`, "/accounting/payables"];
  switch (String(form.get("step"))) {
    case "submit":
      return rpc("submit_supplier_payment", { p_id: id }, paths, "Sent to the CEO for approval.");
    case "paid": {
      const d = date.safeParse(form.get("pay_date"));
      return rpc("mark_supplier_payment_paid", { p_id: id, p_reference: String(form.get("reference") ?? ""), p_pay_date: d.success ? d.data : null }, paths, "Payment recorded and posted.");
    }
    case "cancel":
      return rpc("cancel_supplier_payment", { p_id: id }, paths, "Payment cancelled.");
    default:
      return { error: "Unknown step." };
  }
}

// ================================================================ petty cash and banks
export async function releasePettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  return rpc("release_petty_cash", { p_id: uuid.parse(form.get("id")), p_expense_account: uuid.parse(form.get("account_id")) }, ["/accounting/banks"], "Released and posted.");
}

/** Bank statement pasted from the bank's CSV: date, description, reference, amount (in +, out −). */
export async function importStatement(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("bank.reconcile");
  const account = uuid.safeParse(form.get("account_id"));
  if (!account.success) return { error: "Choose the account." };
  const rows: { account_id: string; txn_date: string; description: string; reference: string; amount: string }[] = [];
  const bad: number[] = [];
  String(form.get("csv") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^date/i.test(l))
    .forEach((l, i) => {
      const cells = l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim());
      const [d, desc = "", ref = "", amt = ""] = cells;
      const neg = /^-|\(.*\)$/.test(amt);
      const m = parseMoney(amt.replace(/^-|[()]/g, ""));
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d) ? `${d.split("/")[2]}-${d.split("/")[0].padStart(2, "0")}-${d.split("/")[1].padStart(2, "0")}` : null;
      if (!iso || !m || Number(m) === 0) bad.push(i + 1);
      else rows.push({ account_id: account.data, txn_date: iso, description: desc.slice(0, 200), reference: ref.slice(0, 80), amount: neg ? `-${m}` : m });
    });
  if (bad.length) return { error: `Check line(s) ${bad.slice(0, 10).join(", ")}: "date (YYYY-MM-DD or MM/DD/YYYY), description, reference, amount".` };
  if (!rows.length) return { error: "Paste the statement lines." };
  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").upsert(rows, { onConflict: "account_id,txn_date,amount,reference,description", ignoreDuplicates: true });
  if (error) return fail(error);
  const { data: n } = await supabase.rpc("bank_auto_match", { p_account: account.data });
  revalidatePath(`/accounting/banks/${account.data}`);
  return { message: `${rows.length} line(s) imported; ${n ?? 0} matched automatically.` };
}

export async function autoMatch(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("bank.reconcile");
  const id = uuid.parse(form.get("account_id"));
  return rpc("bank_auto_match", { p_account: id }, [`/accounting/banks/${id}`], (n) => `${n} matched.`);
}

export async function matchLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("bank.reconcile");
  const account = uuid.parse(form.get("account_id"));
  const jl = form.get("journal_line_id");
  return rpc("bank_match", { p_statement_line: uuid.parse(form.get("id")), p_journal_line: jl ? uuid.parse(jl) : null }, [`/accounting/banks/${account}`], jl ? "Matched." : "Unmatched.");
}

// ================================================================ disbursements
/** A company-paid expense typed in (no photo): becomes a draft journal (expense + input VAT / cash) for the CEO. */
export async function recordExpense(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("accounting.journals.create");
  const v = z
    .object({
      receipt_date: date,
      vendor_name: z.string().trim().min(2, "Enter the store or vendor.").max(160),
      vendor_tin: text(30),
      receipt_no: text(60),
      amount: z.preprocess((x) => parseMoney(String(x ?? "")), z.string({ message: "Enter the amount paid." })),
      vat_amount: z.preprocess((x) => parseMoney(String(x || "0")), z.string({ message: "Check the VAT amount." })),
      expense_account_id: z.string().uuid({ message: "Choose what the expense is for." }),
      paid_from: z.string().uuid({ message: "Choose the account it was paid from." }),
      description: text(300),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  if (Number(v.data.amount) <= 0) return { error: "Enter the amount paid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_expense_receipt", {
    p_date: v.data.receipt_date, p_vendor: v.data.vendor_name, p_tin: v.data.vendor_tin, p_receipt_no: v.data.receipt_no,
    p_amount: v.data.amount, p_vat: v.data.vat_amount, p_expense_account: v.data.expense_account_id, p_description: v.data.description,
    p_petty_cash: null, p_paid_from: v.data.paid_from, p_scan: null,
  });
  if (error) return fail(error);
  const { data: r } = await supabase.from("expense_receipts").select("journal_entry_id").eq("id", data as string).single();
  revalidatePath("/accounting/disbursements");
  redirect(`/accounting/journals/${(r as { journal_entry_id: string }).journal_entry_id}`);
}
