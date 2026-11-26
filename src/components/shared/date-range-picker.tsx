"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import { presetRange, RANGE_LABELS, type RangePreset } from "@/lib/date-range";

/** From/to dates with Manila presets. Submits `${name}_from` and `${name}_to` (YYYY-MM-DD) in a GET form. */
export function DateRangePicker({ name = "date", from, to }: { name?: string; from?: string; to?: string }) {
  const [range, setRange] = useState({ from: from ?? "", to: to ?? "" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Date preset"
        defaultValue=""
        onChange={(e) => e.target.value && setRange(presetRange(e.target.value as RangePreset))}
        className="w-36"
      >
        <option value="">Any date</option>
        {Object.entries(RANGE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </Select>
      <Input type="date" name={`${name}_from`} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" className="w-40" />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" name={`${name}_to`} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" className="w-40" />
    </div>
  );
}
