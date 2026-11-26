import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createCustomer } from "../actions";
import { TYPE_LABEL } from "../parts";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["sales.view", "sales.customers.manage"]);
  const sp = await searchParams;
  const access = await getAccess();
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "");
  const supabase = await createClient();
  let query = supabase.from("customers").select("id, code, name, type, mobile, payment_terms_days, credit_limit, on_hold, active, source").order("name").limit(300);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,mobile.ilike.%${q}%`);
  if (sp.type) query = query.eq("type", sp.type);
  const { data } = await query;
  const rows = (data as { id: string; code: string; name: string; type: string; mobile: string; payment_terms_days: number; credit_limit: string; on_hold: boolean; active: boolean; source: string }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Customers" description="Every customer from every channel, with their price list and credit terms. Shop buyers are added automatically." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="mb-3 flex flex-wrap gap-2" action="/sales/customers">
            <Input name="q" defaultValue={q} placeholder="Name, code or mobile" className="h-9 flex-1" aria-label="Search customers" />
            <Select name="type" defaultValue={sp.type ?? ""} className="h-9 w-40" aria-label="Type">
              <option value="">All types</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <button className="h-9 rounded-lg border px-3 text-sm">Search</button>
          </form>
          <Table>
            <thead><tr><Th>Customer</Th><Th>Type</Th><Th>Mobile</Th><Th>Terms</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <Td><Link href={`/sales/customers/${c.id}`} className="font-medium text-brand underline">{c.name}</Link><div className="text-xs text-muted-foreground">{c.code}{c.source === "shop" ? " · from shop" : ""}</div></Td>
                  <Td>{TYPE_LABEL[c.type]}</Td>
                  <Td>{c.mobile || "—"}</Td>
                  <Td>{c.payment_terms_days ? `${c.payment_terms_days} days, limit ₱${Number(c.credit_limit).toLocaleString("en-PH")}` : "Pay first"}{c.on_hold && <Badge tone="danger" className="ml-1">On hold</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No customers found.</p>}
        </Card>
        {can(access, "sales.customers.manage") && (
          <Card>
            <CardTitle>New customer</CardTitle>
            <ActionForm action={createCustomer} submitLabel="Add customer">
              <Field label="Name (business or person)" htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label="Type" htmlFor="type" hint="Sets the price list.">
                <Select id="type" name="type" defaultValue="regular">
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" inputMode="tel" /></Field>
              <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
              <Field label="TIN" htmlFor="tin"><Input id="tin" name="tin" /></Field>
              <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
