/**
 * Formats product records for AI prompts. Fields still marked TODO are left out so the AI never
 * treats placeholder data as fact; unverified products are labelled as such.
 */

export interface ProductFacts {
  brand: string;
  line: string;
  name: string;
  category: string;
  sizes: string[];
  price_php: number | null;
  ingredients: string;
  allergens: string;
  shelf_life: string;
  storage: string;
  use_cases: string;
  recipes: string;
  target_customers: string;
  selling_points: string;
  competitor_notes: string;
  faqs: { q: string; a: string }[];
  verified: boolean;
}

const isKnown = (v: string | null | undefined) => !!v && !/^\s*TODO\b/i.test(v) && v.trim() !== "";

export function formatProductFacts(products: ProductFacts[]): string {
  if (!products.length) return "(No specific products for this scenario.)";
  return products
    .map((p) => {
      const lines = [`### ${p.name} (${[p.brand, p.line].filter(Boolean).join(" · ")})${p.verified ? "" : " [UNVERIFIED placeholder data]"}`];
      const add = (label: string, v: string | null | undefined) => isKnown(v) && lines.push(`- ${label}: ${v!.replace(/\s*TODO:?[^.]*\.?/gi, "").trim()}`);
      if (p.sizes.length) lines.push(`- Sizes: ${p.sizes.join(", ")}`);
      if (p.price_php != null) lines.push(`- Price: ₱${p.price_php.toLocaleString("en-PH")}${p.verified ? "" : " (approximate)"}`);
      add("Category", p.category);
      add("Ingredients", p.ingredients);
      add("Allergens", p.allergens);
      add("Shelf life", p.shelf_life);
      add("Storage", p.storage);
      add("Uses", p.use_cases);
      add("Recipes", p.recipes);
      add("Best for", p.target_customers);
      add("Selling points", p.selling_points);
      add("Competitor notes", p.competitor_notes);
      p.faqs.filter((f) => isKnown(f.a)).forEach((f) => lines.push(`- FAQ: ${f.q} → ${f.a}`));
      return lines.join("\n");
    })
    .join("\n\n");
}
