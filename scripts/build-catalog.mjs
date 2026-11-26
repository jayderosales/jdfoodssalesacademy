// Builds docs/data/products-srp-2026-05.csv from the "JD Foods SRP Pricelist (PRODUCTS) Effective May 2026" PDF.
// One row per sellable SKU (each size is its own SKU, sold by the piece). SRP is the price-list retail price in pesos.
// Codes without a code in the PDF get a generated one (prefix by brand/series). Re-run: node scripts/build-catalog.mjs
import { writeFileSync } from "node:fs";

const rows = [];
// SKUs must fit 40 characters (products.sku check): drop filler words, then trim.
const shortSku = (s) =>
  s.length <= 40 ? s : s.replace(/-(FLAVOR|SEASONING)(?=-)/g, "").replace(/COMPARTMENT/g, "COMP").replace(/-(\d+)-(G|KG)$/, "-$1$2").slice(0, 40).replace(/-$/, "");
const add = (r) => rows.push({ pre_order: "", pack_qty: "", notes: "", ...r, sku: shortSku(r.sku) });
const slug = (s) =>
  s.toUpperCase().replace(/\([^)]*\)/g, "").replace(/&/g, "AND").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ---------------------------------------------------------------- JD Foods sauces (bottles, 4 or 3 sizes)
const premium = ["Sweet Barbecue", "Sesame Barbecue", "Garlic Barbecue", "Hickory Barbecue", "Spicy Garlic Barbecue", "Sweet Chili", "Spicy & Sweet Chili", "Spicy Honey Glaze", "Filipino Japanese Teriyaki", "Original Japanese Teriyaki", "Honey Barbecue", "Orange Glaze", "Honey Glaze", "Arabian's Kebab", "Roasted Sesame", "Yangnyeom", "Spicy Garlic Mayo", "Garlic Mayo Sauce"];
const sizes4 = [["GAL", "1 gallon", 850], ["1L", "1 liter", 256], ["500ML", "500 ml", 153], ["350ML", "350 ml", 99]];
premium.forEach((n, i) => sizes4.forEach(([s, label, p]) => add({ sku: `P${i + 1}-${s}`, name: `Premium ${n} ${label}`, brand: "JD Foods", category: "Premium Sauces", item_type: "finished_good", base_unit: "bottle", size: label, srp: p })));

const classic = ["Spicy Garlic Butter", "Sweet Barbecue", "Sesame Barbecue", "Garlic Barbecue", "Hickory Barbecue", "Spicy Garlic Barbecue", "Lemon Sesame", "Sweet Chili", "Spicy Honey Glaze", "Japanese Teriyaki", "Premium Japanese Teriyaki", "Signature Blazing Hot", "Honey Barbecue", "Orange Glaze", "Honey Glaze", "Korean Barbecue", "Garlic Butter", "Fiery Buffalo", "Spicy Caribbean", "Oriental Sriracha", "Premium Kebab", "Fireball Buffalo", "Hawaiian Bourbon", "Jamaican Jerky", "Peanut Sauce", "Tropical Mango Sauce", "Spicy Tropical Mango Sauce"];
classic.forEach((n, i) => {
  const hi = i >= 17; // C18–C27
  [["GAL", "1 gallon", hi ? 1550 : 1500], ["1L", "1 liter", hi ? 511 : 477], ["500ML", "500 ml", hi ? 278 : 261]].forEach(([s, label, p]) =>
    add({ sku: `C${i + 1}-${s}`, name: `${n} ${label}`, brand: "JD Foods", category: "Classic Sauces", item_type: "finished_good", base_unit: "bottle", size: label, srp: p }),
  );
});
[["M1", "Special Barbecue Marinade"], ["M3", "Hickory Barbecue Marinade"], ["M4", "Teriyaki Marinade"]].forEach(([c, n]) =>
  [["GAL", "1 gallon", 1350], ["1L", "1 liter", 422], ["500ML", "500 ml", 244]].forEach(([s, label, p]) =>
    add({ sku: `${c}-${s}`, name: `${n} ${label}`, brand: "JD Foods", category: "Marinades", item_type: "finished_good", base_unit: "bottle", size: label, srp: p }),
  ),
);
[["MP1", "Garlic Savory Fried Rice Blend", 510, 140], ["MP2", "Java Savory Rice Blend", 495, 135], ["MP3", "Sautei Savory Mix", 480, 130]].forEach(([c, n, kg, g250]) => {
  add({ sku: `${c}-1KG`, name: `${n} 1 kg`, brand: "JD Foods", category: "Mix Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: kg });
  add({ sku: `${c}-250G`, name: `${n} 250 g`, brand: "JD Foods", category: "Mix Powders", item_type: "finished_good", base_unit: "pack", size: "250 g", srp: g250 });
});
add({ sku: "BM1-1KG", name: "Premium Breading Mix 1 kg", brand: "JD Foods", category: "Breading Mix Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 450 });
add({ sku: "BM1-500G", name: "Premium Breading Mix 500 g", brand: "JD Foods", category: "Breading Mix Powders", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 250 });

// ---------------------------------------------------------------- JD Foods beverage powders and syrups
["Buko Pandan", "Cappuccino", "Chocolate", "Cookies & Cream", "Sweet Avocado", "Macchiato", "Mango", "Mocha", "Rocky Road", "Strawberry", "Taro", "Ube Macapuno"].forEach((n, i) =>
  add({ sku: `FP${i + 1}-1KG`, name: `${n} Frappe Powder 1 kg`, brand: "JD Foods", category: "Frappe Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 280 }),
);
[["FS1", "Caramel Syrup 1 kg", "pack", "1 kg", 290], ["FS2", "Chocolate Syrup 1 kg", "pack", "1 kg", 276], ["FS3", "Strawberry Syrup 1 kg", "pack", "1 kg", 255], ["FS4", "Fructose Syrup 1 gallon", "bottle", "1 gallon", 632]].forEach(([c, n, u, sz, p]) =>
  add({ sku: c, name: n, brand: "JD Foods", category: "Flavored Syrups", item_type: "finished_good", base_unit: u, size: sz, srp: p }),
);
add({ sku: "CP1-1KG", name: "Barako Strong Coffee 1 kg", brand: "JD Foods", category: "Coffee Powder", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 740 });
[["JP1", "Blue Lemonade", "400 g"], ["JP2", "Cucumber Lemonade", "400 g"], ["JP3", "Lemon Iced Tea", "400 g"], ["JP4", "Red Iced Tea", "400 g"], ["JP5", "Sago't Gulaman", "225 g"]].forEach(([c, n, sz]) =>
  add({ sku: c, name: `${n} ${sz}`, brand: "JD Foods", category: "Juice Powder", item_type: "finished_good", base_unit: "pack", size: sz, srp: 198 }),
);
const series = (prefix, category, list, unit = "pack") =>
  list.forEach(([n, sz, p]) => add({ sku: `${prefix}-${slug(n)}${sz ? "-" + slug(sz) : ""}`, name: sz ? `${n} ${sz}` : n, brand: "JD Foods", category, item_type: "finished_good", base_unit: unit, size: sz, srp: p }));
series("AO", "Add-ons", [["Whipped Cream Powder", "1 kg", 450], ["Chicken Crispy Isaw", "100 g", 140], ["Chicken Crispy Isaw", "300 g", 410]]);
add({ sku: "AO-ALL-PURPOSE-CHILI-GARLIC-120G", name: "All Purpose Chili Garlic 120 g", brand: "JD Foods", category: "Add-ons", item_type: "finished_good", base_unit: "bottle", size: "120 g", srp: 150 });
series("MC", "Milk, Cream & Cheese", [["Milky Cream Base Powder", "1 kg", 340], ["Fresh Yogurt Powder", "1 kg", 327], ["Salted Cream Cheese Powder", "500 g", 255], ["Dark Chocolate Powder", "1 kg", 556]]);
series("MT", "Milk Tea Series", [["Classic Milk Tea Powder", "1 kg", 386], ["Japanese Matcha Powder", "1 kg", 477], ["Okinawa Milk Tea Powder", "500 g", 203], ["Wintermelon Milk Tea Powder", "500 g", 203]]);
series("BC", "Barista Coffee & Flavor", [["Cafe Mocha Powder", "1 kg", 432]]);
series("IC", "Soft Serve & Gelato", [["Vanilla Ice Cream Powder", "1 kg", 275], ["Chocolate Ice Cream Powder", "1 kg", 301], ["Mango Ice Cream Powder", "1 kg", 275]]);

// ---------------------------------------------------------------- equipment, materials, marketing (JD Foods)
const merch = (prefix, category, list, type = "merchandise") =>
  list.forEach(([n, qty, unit, p]) => add({ sku: `${prefix}-${slug(n)}`, name: n, brand: "JD Foods", category, item_type: type, base_unit: unit, size: qty > 1 ? `${qty} ${unit}` : "", srp: p, pack_qty: qty > 1 ? qty : "" }));
merch("EQ", "Equipment", [["Blender 1L", 1, "unit", 1223], ["Butane Stove", 1, "unit", 550], ["Chinese Wok 40cm", 1, "unit", 2500], ["Coffee Maker Kyowa 10 cups", 1, "unit", 1233], ["Deep Fryer Single Electric", 1, "unit", 3250], ["Deep Fryer Double Electric", 1, "unit", 6500], ["Deep Fryer Double Gas", 1, "unit", 8800], ["Digital Weighing Scale 5000g", 1, "unit", 1545], ["Griller with Hotpot", 1, "unit", 980], ["Microwave 20L", 1, "unit", 5000], ["Noodle Fryer and Boiler Gas", 1, "unit", 3250], ["Pressure Cooker 6L", 1, "unit", 1350], ["Rice Cooker 23L", 1, "unit", 7500], ["Smokeless Grill Pan for Butane Stove", 1, "unit", 520], ["Smokeless Griller 2 burner Gas", 1, "unit", 3880], ["Smokeless Griller 3 burner Gas", 1, "unit", 5820], ["Smokeless Griller 4 burner Gas", 1, "unit", 7670], ["Smokeless Griller 6 burner Gas", 1, "unit", 9980], ["Thermos Barrel 8L", 1, "unit", 1125]]);
merch("MAT", "Materials", [["Butane Gas", 1, "pc", 120], ["Chopsticks Wooden 100s", 100, "pcs", 98], ["Food Tray Black 12s", 12, "pcs", 650], ["Food Tray Red 12s", 12, "pcs", 650], ["Ice Box 15L", 1, "box", 998], ["Paper Cups with Lids 12oz 100s", 1, "pack", 850], ["Paper Meal Box Small 50s", 50, "pcs", 365], ["Paper Meal Box Large 50s", 50, "pcs", 500], ["Paper Meal Box Single Compartment 25s", 25, "pcs", 110], ["Paper Meal Box Double Compartment 50s", 50, "pcs", 220], ["Plastic Bag for Cups Single 100s", 100, "pcs", 160], ["Plastic Bag for Cups Double 100s", 100, "pcs", 240], ["Plastic Cups with Dome S 100s", 100, "pcs", 617], ["Plastic Cups with Dome M 100s", 100, "pcs", 658], ["Plastic Cups with Dome L 100s", 100, "pcs", 764], ["Plastic Cups with Flat Lid S 100s", 100, "pcs", 460], ["Plastic Cups with Flat Lid M 100s", 100, "pcs", 562], ["Plastic Cups with Flat Lid L 100s", 100, "pcs", 609], ["Plastic Gloves", 1, "pack", 65], ["Powder Container", 1, "pc", 75], ["Scooper for Black Pearl", 1, "pc", 180], ["Scooper for Powder", 1, "pc", 55], ["Silicon Food Brush", 1, "pc", 70], ["Straw Big 250s", 250, "pcs", 267], ["Straw Small Bendable 100s", 100, "pcs", 88], ["Syrup Canister Squeezer", 1, "pc", 63], ["Wax Paper 30cm x 150m", 1, "roll", 650], ["Whipped Cream Dispenser", 1, "pc", 3300], ["Whipped Cream Dispenser Charger 10s", 10, "pcs", 210]]);
merch("MKT", "Marketing Collaterals", [["365 Days Ready-to-post SocMed Layout", 1, "set", 2000], ["Templated Menu", 1, "layout", 500], ["Customized Menu Layout", 1, "layout", 800], ["Customized Big Scale Menu Layout", 1, "layout", 1400], ["Logo Design", 1, "layout", 4999], ["Flyers A5 100 prints", 1, "set", 800], ["Calling or Loyalty Card 100 prints", 1, "set", 550]], "service");

// ---------------------------------------------------------------- ThyChef
const thy = [["F1", "BBQ Seasoning Powder"], ["F2", "Cheese Powder"], ["F3", "Cheddar Cheese Powder"], ["F5", "Ghost Chili Pepper Powder"], ["F7", "Hot And Spicy Powder"], ["F11", "Nori Seaweed Powder"], ["F14", "Pizza Powder"], ["F16", "Salted Egg Cheese Powder"], ["F19", "Sour Cream and Onion Powder"], ["F21", "Sriracha Powder"], ["F24", "Tomyum Powder"], ["F25", "Truffle Powder"]];
thy.forEach(([c, n]) => add({ sku: `${c}-1KG`, name: `${n} 1 kg`, brand: "ThyChef", category: "Flavored Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 800 }));
add({ sku: "F29-1KG", name: "Salted Egg Seasoning Powder 1 kg", brand: "ThyChef", category: "Flavored Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 1550 });
[["F4", "For Kaizab Powder (Spicy Cayenne)"], ["F6", "Grilled Squid Powder"], ["F8", "Laab Seasoning Powder (Thai Spice)"], ["F9", "Mala BBQ Powder"], ["F10", "Mexican Chili Powder"], ["F12", "Paprika Powder"], ["F13", "Phed Zaab Jeed Powder (Spicy Pepper)"], ["F15", "Prawn Crispy Powder"], ["F17", "Salty Cheese Powder"], ["F18", "Seafood Powder"], ["F20", "Spicy Korean Ramen Powder"], ["F22", "Corn Cheese Powder"], ["F23", "Tomato Sauce Powder"], ["F26", "Wasabi Powder"], ["F27", "Wing Zap Powder (Texan BBQ)"], ["F28", "Yum Kai Zab Powder (Savory Bliss)"]].forEach(([c, n]) =>
  add({ sku: `${c}-BOX25`, name: `${n} box of 25 x 1 kg`, brand: "ThyChef", category: "Flavored Powders (Pre-order)", item_type: "finished_good", base_unit: "box", size: "25 x 1 kg", srp: 20000, pre_order: "yes", pack_qty: 25, notes: "Pre-order, bulk per box, needs lead time" }),
);
["BBQ", "Garlic & Pepper", "Kai Sawan", "New Orlean", "Satay"].forEach((n) =>
  add({ sku: `TC-MAR-${slug(n)}-500G`, name: `${n} Marinade Powder 500 g`, brand: "ThyChef", category: "Marinade Powders", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 452 }),
);
add({ sku: "BM2-1KG", name: "Fried Chicken Flour Mix (Batter Breading) 1 kg", brand: "ThyChef", category: "Breading Mix Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 450 });
add({ sku: "SP1-500G", name: "Clear Noodles Soup Powder 500 g", brand: "ThyChef", category: "Soup Powders", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 385 });
add({ sku: "SP2-500G", name: "Creamy Tomyum Noodles Soup Powder 500 g", brand: "ThyChef", category: "Soup Powders", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 385, pre_order: "yes", notes: "Pre-order" });
add({ sku: "SP3-500G", name: "Namtok Noodle Soup Powder 500 g", brand: "ThyChef", category: "Soup Powders", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 385, pre_order: "yes", notes: "Pre-order" });
add({ sku: "SP4-1KG", name: "Chicken Soup Seasoning Powder (All Purpose) 1 kg", brand: "ThyChef", category: "Soup Powders", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 498 });
add({ sku: "TC-DIPPING-CHEESE-250G", name: "Dipping Cheese Sauce Powder 250 g", brand: "ThyChef", category: "Cheese Powder", item_type: "finished_good", base_unit: "pack", size: "250 g", srp: 336 });
add({ sku: "TC-SAMPLE-PACK", name: "ThyChef Complete Sample Pack", brand: "ThyChef", category: "Sample Package", item_type: "bundle", base_unit: "pack", size: "", srp: 880, notes: "Flavored powders 12 x 20 g; marinade powders 5 x 50 g; batter breading 1 x 200 g; dipping cheese powder 1 x 50 g; clear noodles soup powder 1 x 30 g. Component SKUs (sample sizes) to be confirmed." });

// ---------------------------------------------------------------- McKeith
[["Avocado Sauce", 386], ["Burger Special Sauce", 414], ["Cheese Yolk Sauce", 301], ["Dragon Fruit and Strawberry Sauce", 301], ["Garlic Soy Sauce", 340], ["Honey Mustard Sauce", 264], ["Original Cheese Sauce", 340], ["Sweet and Sour Sauce", 301], ["Sweet and Spicy Sauce", 301], ["Wasabi Mustard Sauce", 414], ["Yogurt Cheese Sauce", 367]].forEach(([n, p]) =>
  add({ sku: `MK-${slug(n)}-1KG`, name: `McKeith ${n} 1 kg`, brand: "McKeith", category: "McKeith Sauces", item_type: "merchandise", base_unit: "pack", size: "1 kg", srp: p }),
);
[["Cheese Onion Flavor Seasoning Powder", "500 g", 566], ["Creamy Garlic Flavor Seasoning Powder", "500 g", 566], ["Honey Butter Cheese Seasoning Powder", "500 g", 566], ["Red Chilli Cheese Seasoning Powder", "500 g", 372], ["Yogurt Cheese Seasoning Powder", "500 g", 566], ["Snow Cheese Seasoning Powder", "1 kg", 744], ["Red Powder (Chicken Breading)", "5 kg", 854], ["Original Marinade Powder", "1 kg", 566]].forEach(([n, sz, p]) =>
  add({ sku: `MK-${slug(n)}-${slug(sz)}`, name: `McKeith ${n} ${sz}`, brand: "McKeith", category: "McKeith Powders", item_type: "merchandise", base_unit: "pack", size: sz, srp: p }),
);

// ---------------------------------------------------------------- Arkadia / Catcher Gourmet (espresso-coffee)
[["Blue Curacao", "750 ml", 495], ["Butterscotch", "1 liter", 620], ["Caramel", "1 liter", 620], ["Hazelnut", "750 ml", 495], ["Irish Cream", "1 liter", 620], ["Lemonade", "750 ml", 495], ["Lychee", "750 ml", 495], ["Macadamia", "750 ml", 495], ["Passionfruit", "750 ml", 495], ["Peach", "750 ml", 495], ["Salted Caramel", "750 ml", 495], ["Strawberry", "750 ml", 575], ["Vanilla", "1 liter", 640], ["Watermelon", "750 ml", 495], ["White Chocolate", "750 ml", 495]].forEach(([n, sz, p]) =>
  add({ sku: `AR-SYR-${slug(n)}`, name: `Arkadia ${n} Premium Syrup ${sz}`, brand: "Arkadia", category: "Arkadia Premium Syrups", item_type: "merchandise", base_unit: "bottle", size: sz, srp: p }),
);
[["Chai Spice", 2260], ["Chamomile", 2260], ["Earl Grey", 2160], ["English Breakfast", 2050], ["Green Sencha", 2050], ["Lemongrass Ginger", 2260], ["Peppermint", 2260]].forEach(([n, p]) =>
  add({ sku: `AR-TEA-${slug(n)}`, name: `Arkadia ${n} Tea (100 pyramid bags)`, brand: "Arkadia", category: "Arkadia Pyramid Tea Bags", item_type: "merchandise", base_unit: "pack", size: "100 bags", srp: p }),
);
[["Chai Spice", 830], ["Chai Vanilla", 830], ["Chai Matcha", 1100]].forEach(([n, p]) => add({ sku: `AR-${slug(n)}-1KG`, name: `Arkadia ${n} 1 kg`, brand: "Arkadia", category: "Arkadia Chai", item_type: "merchandise", base_unit: "pack", size: "1 kg", srp: p }));
add({ sku: "AR-YOGHURT-SMOOTHIE-1KG", name: "Arkadia Yoghurt Smoothie 1 kg", brand: "Arkadia", category: "Arkadia Smoothie", item_type: "merchandise", base_unit: "pack", size: "1 kg", srp: 940 });
[["Caramel", "2 liters", 1060], ["Chocolate", "2 liters", 1060], ["Matcha", "2 liters", 1060], ["Salted Caramel", "2 liters", 1060], ["White Chocolate", "2 liters", 1060], ["Hazelnut", "1 liter", 1060], ["Blueberry", "1 liter", 750], ["Peach Fruity", "1 liter", 750], ["Pink Guava", "1 liter", 750], ["Strawberry", "1 liter", 750]].forEach(([n, sz, p]) =>
  add({ sku: `CG-SAUCE-${slug(n)}-${slug(sz)}`, name: `Catcher ${n} Flavor Sauce ${sz}`, brand: "Catcher Gourmet", category: "Catcher Gourmet Sauces", item_type: "merchandise", base_unit: "bottle", size: sz, srp: p }),
);
["Bellagio Chocolate", "Creme Vanilla", "Matcha Latte", "White Chocolate"].forEach((n) =>
  add({ sku: `CG-PWD-${slug(n)}-1KG`, name: `Catcher ${n} Powder 1 kg`, brand: "Catcher Gourmet", category: "Catcher Gourmet Powders", item_type: "merchandise", base_unit: "pack", size: "1 kg", srp: 840 }),
);
add({ sku: "CB1-500G", name: "Espresso Beans 500 g", brand: "JD Foods", category: "Coffee Beans", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 520 });
add({ sku: "CB2-500G", name: "Matutum Beans 500 g", brand: "JD Foods", category: "Coffee Beans", item_type: "finished_good", base_unit: "pack", size: "500 g", srp: 580 });
add({ sku: "ES-FRAPPE-BASE-1KG", name: "Frappe Base 1 kg", brand: "JD Foods", category: "Milks & Other Products", item_type: "finished_good", base_unit: "pack", size: "1 kg", srp: 430 });
const esp = [["Barmat", "pc", 304], ["Barspoon", "pc", 98], ["Caffeto Espresso Clean", "jar", 1450], ["Caffeto Evo", "jar", 1450], ["Digital Weighing Scale MS-K07", "unit", 450], ["Espresso Shot Glass", "pc", 560], ["Eureka Specialita Grinder", "unit", 38000], ["Gemilai Espresso Machine and Koryaiko Grinder Set", "set", 75000], ["Grinder Tray", "pc", 182], ["Heavy Duty Blender", "unit", 21000], ["Jigger", "pc", 112], ["Knockbox", "pc", 700], ["Milk Frother", "pc", 420], ["Milk Jug 350ml", "pc", 549], ["Milk Jug 600ml", "pc", 493], ["Milk Jug 900ml", "pc", 594], ["Mosa Charger 10s", "box", 301], ["Scooper", "pc", 72], ["Squeeze Bottle", "pc", 112], ["Sauce Pump 2L", "pc", 532], ["Syrup Pump 1L", "pc", 455], ["Takeout Plastic Single 100s", "pack", 133], ["Takeout Plastic Double 100s", "pack", 147], ["Tamper Mat", "pc", 525], ["Tamper Smoothing Powder", "pack", 1470], ["Whip Cream Dispenser Stainless", "pc", 1449], ["Wooden Handle Coffee Tamper", "pc", 2030]];
esp.forEach(([n, u, p]) =>
  add({ sku: `ES-${slug(n)}`, name: n, brand: "JD Foods", category: "Espresso Equipment & Materials", item_type: "merchandise", base_unit: u, size: "", srp: p, notes: n.includes("Gemilai") ? "Price list shows one price (75,000) for the machine and grinder together; confirm whether they're sold as a set." : "" }),
);

// ---------------------------------------------------------------- write CSV
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.sku)) throw new Error(`Duplicate SKU ${r.sku}`);
  seen.add(r.sku);
}
const cols = ["sku", "name", "brand", "category", "item_type", "base_unit", "size", "srp", "pre_order", "pack_qty", "notes"];
const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
writeFileSync(new URL("../docs/data/products-srp-2026-05.csv", import.meta.url), csv);
console.log(`${rows.length} products written`);
const byBrand = rows.reduce((a, r) => ((a[r.brand] = (a[r.brand] ?? 0) + 1), a), {});
console.log(byBrand);
