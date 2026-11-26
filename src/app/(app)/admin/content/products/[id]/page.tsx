import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveProduct } from "../actions";

export const metadata = { title: "Edit product" };

type Product = Record<string, unknown> & {
  id?: string;
  sizes?: string[];
  faqs?: { q: string; a: string }[];
  verified?: boolean;
  active?: boolean;
  lesson_id?: string | null;
  price_php?: number | null;
};

const LONG_FIELDS: [string, string, string?][] = [
  ["ingredients", "Ingredients"],
  ["allergens", "Allergens", "e.g. contains milk, soy. Reps must get this right."],
  ["shelf_life", "Shelf life"],
  ["storage", "Storage"],
  ["use_cases", "Use cases"],
  ["recipes", "Recipes / serving suggestions"],
  ["target_customers", "Target customers"],
  ["selling_points", "Key selling points"],
  ["competitor_notes", "Competitor comparison", "Stick to facts you can prove."],
];

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwner();
  const supabase = await createClient();
  let product: Product = { active: true, verified: false, sizes: [], faqs: [] };
  if (id !== "new") {
    const { data } = await supabase.from("academy_products").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    product = data as Product;
  }
  const { data: lessons } = await supabase.from("lessons").select("id, title, modules!inner(category)").eq("modules.category", "product").order("title");
  const s = (k: string) => (product[k] as string | undefined) ?? "";

  return (
    <>
      <PageHeader
        title={id === "new" ? "Add product" : (product.name as string)}
        actions={<Link href="/admin/content/products" className="text-sm text-brand underline">All products</Link>}
      />
      {!product.verified && id !== "new" && (
        <div className="mb-4">
          <Alert>
            This product has <strong>placeholder data</strong> from the website, with TODO fields. Check every field, then tick “Verified”.
          </Alert>
        </div>
      )}
      <Card className="max-w-3xl">
        <ActionForm action={saveProduct} submitLabel="Save product">
          {product.id && <input type="hidden" name="id" value={product.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand" htmlFor="brand"><Input id="brand" name="brand" defaultValue={s("brand")} required /></Field>
            <Field label="Product line" htmlFor="line"><Input id="line" name="line" defaultValue={s("line")} placeholder="e.g. Flavored Powders" /></Field>
            <Field label="Product name" htmlFor="name"><Input id="name" name="name" defaultValue={s("name")} required /></Field>
            <Field label="Category" htmlFor="category"><Input id="category" name="category" defaultValue={s("category")} placeholder="e.g. Powder, Syrup, Sauce" /></Field>
            <Field label="Sizes" htmlFor="sizes" hint="Comma-separated, e.g. 1 kg, 500 g"><Input id="sizes" name="sizes" defaultValue={(product.sizes ?? []).join(", ")} /></Field>
            <Field label="Price (₱)" htmlFor="price_php" hint="Main SRP. Leave empty if unknown."><Input id="price_php" name="price_php" type="number" step="0.01" min={0} defaultValue={product.price_php ?? ""} /></Field>
          </div>
          {LONG_FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} htmlFor={key} hint={hint}>
              <Textarea id={key} name={key} defaultValue={s(key)} rows={3} />
            </Field>
          ))}
          <Field label="FAQs" htmlFor="faqs" hint='Write "Q: …" then "A: …" on the next line. Leave a blank line between FAQs.'>
            <Textarea
              id="faqs"
              name="faqs"
              rows={6}
              defaultValue={(product.faqs ?? []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}
            />
          </Field>
          <Field label="Product lesson" htmlFor="lesson_id" hint="The lesson in Product Knowledge that teaches this product.">
            <Select id="lesson_id" name="lesson_id" defaultValue={product.lesson_id ?? ""}>
              <option value="">— None —</option>
              {(lessons ?? []).map((l: { id: string; title: string }) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </Select>
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="verified" defaultChecked={product.verified} className="size-4" /> Verified (all facts checked)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={product.active} className="size-4" /> Active (currently sold)
            </label>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
