import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th, buttonVariants } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, brand, line, name, category, price_php, verified, active").order("brand").order("line").order("name");
  const products = (data ?? []) as { id: string; brand: string; line: string; name: string; category: string; price_php: number | null; verified: boolean; active: boolean }[];
  const unverified = products.filter((p) => !p.verified).length;

  return (
    <>
      <PageHeader
        title="Products"
        description={
          unverified
            ? `${unverified} of ${products.length} products still have placeholder data. Verify each one before launch. The AI customer uses these facts to catch wrong claims.`
            : "Product facts used in lessons and by the AI customer in roleplays."
        }
        actions={
          <div className="flex gap-2">
            <Link href="/admin/content" className={buttonVariants({ variant: "outline" })}>Back</Link>
            <Link href="/admin/content/products/new" className={buttonVariants()}>Add product</Link>
          </div>
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/content/products/${p.id}`} className="font-medium text-brand underline">{p.name}</Link>
                  <div className="text-xs text-muted-foreground">{[p.brand, p.line].filter(Boolean).join(" · ")}</div>
                </Td>
                <Td>{p.category || "—"}</Td>
                <Td>{formatPHP(p.price_php)}</Td>
                <Td className="space-x-1">
                  {p.verified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">placeholder</Badge>}
                  {!p.active && <Badge>inactive</Badge>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {products.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No products yet.</p>}
      </Card>
    </>
  );
}
