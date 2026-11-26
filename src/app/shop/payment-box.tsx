"use client";

import { useState } from "react";
import { Copy, ImageUp } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { PaymentDetails } from "./actions";

/** Where to pay: bank details with copy buttons, for checkout and the order page. */
export function BankDetails({ details, amount }: { details: PaymentDetails | null; amount?: string }) {
  const [copied, setCopied] = useState("");
  if (!details || !details.account_no) {
    return details?.instructions ? <p className="whitespace-pre-line text-sm">{details.instructions}</p> : null;
  }
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard blocked: the text is still visible to copy by hand */
    }
  };
  const row = (label: string, value: string, mono = false) => (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-right">
        <b className={mono ? "font-mono tracking-wide" : ""}>{value}</b>
        <button type="button" onClick={() => copy(label, value)} className="rounded p-1 text-muted-foreground hover:text-brand" aria-label={`Copy ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        {copied === label && <span className="text-xs text-success">Copied</span>}
      </span>
    </div>
  );
  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
      <p className="mb-1 font-semibold">Pay by bank transfer{amount ? ` · ${formatMoney(amount)}` : ""}</p>
      {row("Bank", details.bank)}
      {row("Account name", details.account_name)}
      {row("Account number", details.account_no, true)}
      {details.instructions && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{details.instructions}</p>}
    </div>
  );
}

/** Optional proof-of-payment photo + reference number (fields: proof, reference). */
export function ProofFields({ required = false }: { required?: boolean }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-2">
      <label htmlFor="proof" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm font-medium text-brand hover:bg-muted">
        <ImageUp className="h-5 w-5" aria-hidden />
        {name ? `Selected: ${name}` : `Upload proof of payment${required ? "" : " (optional)"}`}
      </label>
      <input id="proof" name="proof" type="file" accept="image/*,application/pdf" className="sr-only" required={required} onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
      <p className="text-xs text-muted-foreground">A screenshot or photo of your transfer receipt. JPG, PNG or PDF, up to 10 MB.</p>
      <Field label="Reference number (optional)" htmlFor="reference"><Input id="reference" name="reference" maxLength={60} autoComplete="off" /></Field>
    </div>
  );
}
