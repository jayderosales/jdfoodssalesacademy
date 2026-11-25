import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveLocation } from "../actions";

export const metadata = { title: "Locations" };

const TYPES: Record<string, string> = {
  office: "Office",
  plant: "Plant",
  warehouse: "Warehouse",
  pickup_hub: "Pickup hub",
  business_center: "Business center",
};

interface Location {
  id: string;
  code: string;
  name: string;
  type: string;
  holds_inventory: boolean;
  is_pickup_point: boolean;
  address: string;
  city: string;
  active: boolean;
}

function LocationFields({ l }: { l?: Location }) {
  const k = l?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Field label="Code" htmlFor={`code-${k}`}><Input id={`code-${k}`} name="code" defaultValue={l?.code} required placeholder="e.g. WH-QC" /></Field>
      <Field label="Name" htmlFor={`name-${k}`}><Input id={`name-${k}`} name="name" defaultValue={l?.name} required /></Field>
      <Field label="Type" htmlFor={`type-${k}`}>
        <Select id={`type-${k}`} name="type" defaultValue={l?.type ?? "warehouse"}>
          {Object.entries(TYPES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select>
      </Field>
      <Field label="City" htmlFor={`city-${k}`}><Input id={`city-${k}`} name="city" defaultValue={l?.city} /></Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Address" htmlFor={`address-${k}`}><Input id={`address-${k}`} name="address" defaultValue={l?.address} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="holds_inventory" defaultChecked={l?.holds_inventory ?? true} className="size-4" /> Holds inventory</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_pickup_point" defaultChecked={l?.is_pickup_point} className="size-4" /> Courier pickup point</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l?.active ?? true} className="size-4" /> Active</label>
    </div>
  );
}

export default async function LocationsPage() {
  const access = await getAccess();
  const canEdit = can(access, "admin.org.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("*").order("active", { ascending: false }).order("name");
  const locations = (data as Location[] | null) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Locations</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Offices, the plant, warehouses and pickup points. Only locations that hold inventory can have stock (Phase 2).</p>
        <ul className="divide-y">
          {locations.map((l) => (
            <li key={l.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground">{l.code} · {TYPES[l.type]}{l.city ? ` · ${l.city}` : ""}</span>
                  {l.holds_inventory && <Badge tone="success">inventory</Badge>}
                  {l.is_pickup_point && <Badge>pickup point</Badge>}
                  {!l.active && <Badge>inactive</Badge>}
                </summary>
                {canEdit && (
                  <div className="mt-3">
                    <ActionForm action={saveLocation} submitLabel="Save location" variant="outline"><LocationFields l={l} /></ActionForm>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && (
        <Card>
          <CardTitle>Add location</CardTitle>
          <ActionForm action={saveLocation} submitLabel="Add location"><LocationFields /></ActionForm>
        </Card>
      )}
    </div>
  );
}
