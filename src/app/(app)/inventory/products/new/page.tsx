import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { catalogOptions } from "../../options";
import { ProductForm } from "../product-form";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requirePermission("inventory.products.manage");
  const opts = await catalogOptions();
  return (
    <>
      <PageHeader title="Add product" actions={<Link href="/inventory/products" className="text-sm text-brand underline">All products</Link>} />
      <Card className="max-w-4xl">
        <ProductForm brands={opts.brands} categories={opts.categories} units={opts.units} />
      </Card>
    </>
  );
}
