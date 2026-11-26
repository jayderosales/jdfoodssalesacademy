"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/shared/inputs";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveProduct, type FormState } from "./actions";

export interface ProductValues {
  id?: string;
  sku?: string;
  name?: string;
  brand_id?: string | null;
  category_id?: string | null;
  item_type?: string;
  base_unit?: string;
  size_label?: string;
  shelf_life_days?: number | null;
  storage_condition?: string;
  fda_cpr_no?: string;
  fda_cpr_expiry?: string | null;
  srp?: string | null;
  release_on_receipt?: boolean;
  track_expiry?: boolean;
  pre_order?: boolean;
  lead_time_days?: number | null;
  active?: boolean;
  notes?: string;
  description?: string;
  image_url?: string;
}
type Opt = { id: string; name: string };

const TYPES: Record<string, string> = {
  finished_good: "Finished good (we make it)",
  merchandise: "Merchandise (we buy and resell)",
  raw_material: "Raw material",
  packaging: "Packaging",
  bundle: "Bundle / kit",
  service: "Service (no stock)",
};

export function ProductForm({ p, brands, categories, units, readOnly }: { p?: ProductValues; brands: Opt[]; categories: Opt[]; units: { code: string; name: string }[]; readOnly?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProduct, {});
  return (
    <form action={action} className="space-y-4">
      {p?.id && <input type="hidden" name="id" value={p.id} />}
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SKU" htmlFor="sku"><Input id="sku" name="sku" defaultValue={p?.sku} required placeholder="P1-1L" /></Field>
          <div className="sm:col-span-2">
            <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={p?.name} required /></Field>
          </div>
          <Field label="Brand" htmlFor="brand_id">
            <Select id="brand_id" name="brand_id" defaultValue={p?.brand_id ?? ""}>
              <option value="">—</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category_id">
            <Select id="category_id" name="category_id" defaultValue={p?.category_id ?? ""}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="…or new category" htmlFor="new_category"><Input id="new_category" name="new_category" placeholder="Type to add a category" /></Field>
          <Field label="Type" htmlFor="item_type">
            <Select id="item_type" name="item_type" defaultValue={p?.item_type ?? "finished_good"}>
              {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Sold / counted by" htmlFor="base_unit">
            <Select id="base_unit" name="base_unit" defaultValue={p?.base_unit ?? "pc"}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Size" htmlFor="size_label"><Input id="size_label" name="size_label" defaultValue={p?.size_label} placeholder="1 liter" /></Field>
          <Field label="SRP (retail price)" htmlFor="srp"><MoneyInput id="srp" name="srp" defaultValue={p?.srp} /></Field>
          <Field label="Shelf life (days)" htmlFor="shelf_life_days"><Input id="shelf_life_days" name="shelf_life_days" type="number" min={1} defaultValue={p?.shelf_life_days ?? ""} /></Field>
          <Field label="Storage" htmlFor="storage_condition">
            <Select id="storage_condition" name="storage_condition" defaultValue={p?.storage_condition ?? "ambient"}>
              <option value="ambient">Room temperature</option>
              <option value="chilled">Chilled</option>
              <option value="frozen">Frozen</option>
            </Select>
          </Field>
          <Field label="FDA CPR no." htmlFor="fda_cpr_no"><Input id="fda_cpr_no" name="fda_cpr_no" defaultValue={p?.fda_cpr_no} /></Field>
          <Field label="CPR expiry" htmlFor="fda_cpr_expiry"><Input id="fda_cpr_expiry" name="fda_cpr_expiry" type="date" defaultValue={p?.fda_cpr_expiry ?? ""} /></Field>
          <Field label="Lead time (days)" htmlFor="lead_time_days"><Input id="lead_time_days" name="lead_time_days" type="number" min={0} defaultValue={p?.lead_time_days ?? ""} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="track_expiry" defaultChecked={p?.track_expiry ?? true} className="size-4" /> Track lot & expiry</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="release_on_receipt" defaultChecked={p?.release_on_receipt ?? false} className="size-4" /> Sellable on receipt (skip QA quarantine)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="pre_order" defaultChecked={p?.pre_order ?? false} className="size-4" /> Pre-order item</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-4" /> Active</label>
        </div>
        <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={p?.notes} /></Field>
        <Field label="Shop description" htmlFor="description" hint="Shown to customers in the online shop."><Textarea id="description" name="description" rows={3} defaultValue={p?.description} /></Field>
        <Field label="Photo link (https://…)" htmlFor="image_url" hint="Link to a product photo, e.g. from Shopify or Google Drive (public link)."><Input id="image_url" name="image_url" type="url" defaultValue={p?.image_url} placeholder="https://" /></Field>
      </fieldset>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {!readOnly && <Button type="submit" disabled={pending}>{pending ? "Saving…" : p?.id ? "Save product" : "Add product"}</Button>}
    </form>
  );
}
