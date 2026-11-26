"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Peso amount input. Submits a clean decimal string ("1234.50"); shows ₱ and thousands separators when not editing. */
export function MoneyInput({
  name,
  id,
  defaultValue,
  required,
  className,
}: {
  name: string;
  id?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  className?: string;
}) {
  const initial = defaultValue == null || defaultValue === "" ? "" : (parseMoney(String(defaultValue)) ?? "");
  const [raw, setRaw] = useState(initial);
  const [focused, setFocused] = useState(false);
  const parsed = parseMoney(raw);
  const invalid = raw !== "" && parsed == null;
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        required={required}
        aria-invalid={invalid || undefined}
        value={focused || !parsed ? raw : formatMoney(parsed).slice(1)}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (parsed) setRaw(parsed);
        }}
        className={cn("pl-7", invalid && "border-danger")}
      />
      <input type="hidden" name={name} value={parsed ?? raw} />
      {invalid && <p className="mt-1 text-xs text-danger">Enter an amount like 1,500 or 1500.50</p>}
    </div>
  );
}

/** Quantity with its unit of measure (units come from the product in Phase 2). */
export function QtyWithUoM({
  name,
  uomName,
  units,
  defaultQty,
  defaultUom,
}: {
  name: string;
  uomName: string;
  units: { code: string; label: string }[];
  defaultQty?: string;
  defaultUom?: string;
}) {
  return (
    <div className="flex gap-2">
      <Input name={name} inputMode="decimal" defaultValue={defaultQty} pattern="^\d+(\.\d{1,4})?$" className="flex-1" aria-label="Quantity" />
      <Select name={uomName} defaultValue={defaultUom ?? units[0]?.code} className="w-32" aria-label="Unit">
        {units.map((u) => (
          <option key={u.code} value={u.code}>{u.label}</option>
        ))}
      </Select>
    </div>
  );
}
