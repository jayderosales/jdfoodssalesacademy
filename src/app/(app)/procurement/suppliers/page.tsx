import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createSupplier } from "../actions";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["procurement.view", "procurement.suppliers.manage"]);
  const sp = await searchParams;
  const access = await getAccess();
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "");
  const supabase = await createClient();
  let query = supabase.from("suppliers").select("id, code, name, category, status, payment_terms_days, vat_registered, mobile").order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data as { id: string; code: string; name: string; category: string; status: string; payment_terms_days: number; vat_registered: boolean; mobile: string }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Suppliers" description="New suppliers start as pending; approve them before raising purchase orders. Blocked suppliers can't get new POs." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="mb-3" action="/procurement/suppliers"><Input name="q" defaultValue={q} placeholder="Search name or code" className="h-9 max-w-xs" aria-label="Search suppliers" /></form>
          <Table>
            <thead><tr><Th>Supplier</Th><Th>Category</Th><Th>Terms</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <Td><Link href={`/procurement/suppliers/${s.id}`} className="font-medium text-brand underline">{s.name}</Link><div className="text-xs text-muted-foreground">{s.code}{s.vat_registered ? " · VAT" : " · non-VAT"}</div></Td>
                  <Td>{s.category || "—"}</Td>
                  <Td>{s.payment_terms_days ? `${s.payment_terms_days} days` : "Cash"}</Td>
                  <Td><StatusBadge status={s.status === "blocked" ? "rejected" : s.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No suppliers yet.</p>}
        </Card>
        {can(access, "procurement.suppliers.manage") && (
          <Card>
            <CardTitle>New supplier</CardTitle>
            <ActionForm action={createSupplier} submitLabel="Add supplier">
              <Field label="Name" htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label="Category" htmlFor="category"><Input id="category" name="category" placeholder="Raw materials, packaging, merchandise…" /></Field>
              <Field label="TIN" htmlFor="tin"><Input id="tin" name="tin" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vat_registered" defaultChecked /> VAT-registered (prices include 12% VAT)</label>
              <Field label="Payment terms (days)" htmlFor="payment_terms_days"><Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={180} defaultValue={30} /></Field>
              <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" /></Field>
              <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
              <Field label="Address" htmlFor="address"><Textarea id="address" name="address" rows={2} /></Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
