import { describe, expect, it } from "vitest";
import { familyName, familyRank, groupFamilies, priceRange, type FamilyMember } from "./families";

const p = (sku: string, name: string, size: string, srp: string, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id: sku, sku, name, brand: "JD Foods", category: "Premium Sauces", size_label: size, srp, image_url: "", item_type: "finished_good", pre_order: false, in_stock: false, ...extra,
});

describe("familyName", () => {
  it("drops the size from the name", () => {
    expect(familyName({ name: "Premium Sweet Barbecue 1 gallon", size_label: "1 gallon" })).toBe("Premium Sweet Barbecue");
    expect(familyName({ name: "Grilled Squid Powder box of 25 x 1 kg", size_label: "25 x 1 kg" })).toBe("Grilled Squid Powder");
    expect(familyName({ name: "Butane Gas", size_label: "" })).toBe("Butane Gas");
  });
});

describe("groupFamilies", () => {
  const list = [
    p("P1-GAL", "Premium Sweet Barbecue 1 gallon", "1 gallon", "850", { image_url: "https://x/gal.png" }),
    p("P1-350ML", "Premium Sweet Barbecue 350 ml", "350 ml", "99"),
    p("P1-500ML", "Premium Sweet Barbecue 500 ml", "500 ml", "153", { in_stock: true }),
    p("C2-500ML", "Sweet Barbecue 500 ml", "500 ml", "261", { category: "Classic Sauces" }),
  ];
  const fams = groupFamilies(list);

  it("puts every size of a flavour together, smallest first", () => {
    const sweet = fams.find((f) => f.name === "Premium Sweet Barbecue")!;
    expect(sweet.variants.map((v) => v.sku)).toEqual(["P1-350ML", "P1-500ML", "P1-GAL"]);
    expect(sweet.image).toBe("https://x/gal.png");
    expect(sweet.inStock).toBe(true);
  });

  it("keeps Premium and Classic apart", () => {
    expect(fams.length).toBe(2);
  });

  it("ranks families with shelf stock first", () => {
    const sweet = fams.find((f) => f.name === "Premium Sweet Barbecue")!;
    const classic = fams.find((f) => f.name === "Sweet Barbecue")!;
    expect(familyRank(sweet)).toBe(0);
    expect(familyRank(classic)).toBe(2);
    const svc = groupFamilies([p("MKT-LOGO", "Logo Design", "", "4999", { item_type: "service", in_stock: true })])[0];
    expect(familyRank(svc)).toBe(1);
  });
});

describe("priceRange", () => {
  it("returns min and max", () => {
    expect(priceRange(["850", "99", "153"])).toEqual({ min: "99.00", max: "850.00" });
  });
});
