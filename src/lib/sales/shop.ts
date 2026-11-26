import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** One row of public.shop_catalog(): what anyone may see about a product. */
export interface ShopProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  size_label: string;
  srp: string;
  description: string;
  image_url: string;
  item_type: string;
  pre_order: boolean;
  in_stock: boolean;
}

export const getCatalog = cache(async (): Promise<ShopProduct[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shop_catalog");
  if (error) {
    console.error("shop_catalog", error);
    return [];
  }
  return (data as ShopProduct[]) ?? [];
});

/** Prices for the visitor: their own price list when signed in as a shop customer, else SRP. */
export async function getShopPrices(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("shop_prices", { p_product_ids: ids });
  return new Map(((data as { product_id: string; price: string }[] | null) ?? []).map((r) => [r.product_id, String(r.price)]));
}

export const BRAND_BLURBS: Record<string, string> = {
  "JD Foods": "Premium and classic sauces, marinades, rice blends, frappe and juice powders.",
  ThyChef: "Flavored powders, marinades, soup bases and breading mixes.",
  Arkadia: "Premium syrups, pyramid tea bags, chai and smoothie mixes.",
  McKeith: "Sauces and seasoning powders for food businesses.",
  "Catcher Gourmet": "Gourmet sauces and powders for cafés.",
};

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
