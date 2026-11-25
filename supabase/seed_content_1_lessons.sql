-- New Hire Onboarding: learning path, modules and lessons.
-- Everything here is editable in Content. Company-specific facts we don't know yet are marked
-- "TODO" so an admin fills them in. Nothing below should be treated as verified company policy.
-- Safe to re-run (fixed ids + on conflict do nothing).

insert into public.learning_paths (id, title, description, is_default, published) values
('10000000-0000-4000-8000-000000000001', 'New Hire Onboarding',
 'Everything a new JD Foods salesperson needs before going to the field: the company, our products, our customers, how we sell, and how we work.',
 true, true)
on conflict (id) do nothing;

insert into public.modules (id, path_id, title, description, sort, sequential_unlock, category) values
('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'About JD Foods', 'Who we are, what we stand for, where our products come from, and our business programs.', 1, true, 'company'),
('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Product Knowledge', 'Every product line: what it is, who buys it, and how to sell it.', 2, true, 'product'),
('11000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Customer Types', 'The six kinds of customers we sell to and what each one cares about.', 3, true, 'customers'),
('11000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Sales Scripts', 'Proven conversation flows for every stage of a sale.', 4, true, 'scripts'),
('11000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Objection Handling', 'How to answer the objections you will hear every week.', 5, true, 'objections'),
('11000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'SOPs', 'How we take orders, price, deliver, collect, handle returns and report.', 6, true, 'sop')
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, sort, est_minutes, published, content_html) values

-- ============================================================ Module 1: About JD Foods
('13000000-0000-4000-8000-000000000101', '11000000-0000-4000-8000-000000000001', 'Welcome to JD Foods', 1, 5, true, $h$
<p>Welcome to the team! This academy teaches you everything you need to sell for JD Foods confidently, at your own pace. Your manager can see your progress, so take your time and do it properly.</p>
<h2>Who we are</h2>
<p>JD Foods is a Philippine company that <strong>manufactures sauces and powders</strong>, <strong>distributes</strong> them to food businesses, and <strong>imports</strong> products from Thailand, China and Australia.</p>
<h2>What we sell</h2>
<ul>
<li><strong>ThyChef</strong>: flavored powders (cheese, barbecue, sour cream and more), marinade powders, breading mixes, soup powders and dipping cheese powders.</li>
<li><strong>Arkadia</strong>: premium syrups, chai and pyramid tea bags for cafés and milk tea shops.</li>
<li><strong>All Purpose Chili Garlic</strong> sauce.</li>
<li><strong>Business packages</strong>, plus distributorship and affiliate programs for people who want to start or grow a food business.</li>
</ul>
<h2>Who buys from us</h2>
<p>Restaurants, food stalls and kiosks, cafeterias, cafés and milk tea shops, home cooks and resellers, aspiring food entrepreneurs, and distributors.</p>
<h2>Your job</h2>
<p>You are not just taking orders. You help food businesses make tastier products, more consistently, at a good cost, so they sell more and keep buying from us. When our customers win, we win.</p>
<p><strong>TODO (admin):</strong> add a short welcome message or video from the owner.</p>
$h$),

('13000000-0000-4000-8000-000000000102', '11000000-0000-4000-8000-000000000001', 'Our mission and values', 2, 5, true, $h$
<h2>Our mission</h2>
<p><strong>TODO (admin):</strong> paste the official JD Foods mission statement here.</p>
<h2>Our four values, and what they mean when you sell</h2>
<h3>1. Quality</h3>
<p>We sell products that perform the same way every time. In the field: know the product well, store and handle stock properly, and never sell something you know is damaged or expired.</p>
<h3>2. Innovation</h3>
<p>We bring new flavors and ideas to Filipino food businesses. In the field: suggest new menu items, new flavor combinations and new ways to use our products, not just the same item they already buy.</p>
<h3>3. Integrity</h3>
<p>We tell the truth. In the field: never invent prices, ingredients, certifications or delivery dates. If you don't know, say <em>"I'll check and get back to you po"</em>, and then actually get back to them.</p>
<h3>4. Win-win collaboration</h3>
<p>A good sale is good for the customer too. In the field: recommend the right size and quantity for their volume, even if it is smaller. A customer who trusts you will re-order and refer others.</p>
<blockquote>Integrity is the value customers notice first. One wrong price or false claim can lose an account forever.</blockquote>
$h$),

('13000000-0000-4000-8000-000000000103', '11000000-0000-4000-8000-000000000001', 'Where our products come from', 3, 5, true, $h$
<p>JD Foods both <strong>manufactures</strong> products and <strong>imports</strong> them. Our sourcing countries are <strong>Thailand, China and Australia</strong>.</p>
<h2>Why sourcing matters in a sales conversation</h2>
<ul>
<li><strong>Consistency:</strong> food businesses need every batch to taste the same. Explain that we supply consistent, packaged products.</li>
<li><strong>Documents:</strong> institutional buyers (schools, offices, hospitals) often ask for product documents such as FDA registration or certificates. Know where to get them.</li>
<li><strong>Supply:</strong> customers worry about running out. Know our usual lead times and stock situation before promising anything.</li>
</ul>
<h2>Fill in before launch</h2>
<ul>
<li><strong>TODO (admin):</strong> which product lines are made locally and which are imported, and from which country.</li>
<li><strong>TODO (admin):</strong> available documents (FDA/LTO, halal, certificates of analysis) and how a salesperson requests them.</li>
<li><strong>TODO (admin):</strong> typical lead time for imported items.</li>
</ul>
<p>Until these are filled in, never guess. Tell the customer you will confirm.</p>
$h$),

('13000000-0000-4000-8000-000000000104', '11000000-0000-4000-8000-000000000001', 'Distributorship, affiliate programs and business packages', 4, 6, true, $h$
<p>Besides selling products to food businesses, JD Foods helps people <strong>start or grow a food business</strong> through three offers.</p>
<h2>Business packages</h2>
<p>Ready-to-start bundles for aspiring food entrepreneurs. A business package is listed at around <strong>₱26,728</strong> (placeholder from the website, so check the current price list).</p>
<p><strong>TODO (admin):</strong> what is inside each package, who it is for, and expected margins.</p>
<h2>Distributorship program</h2>
<p>For businesses that want to buy in volume and resell JD Foods products in their area.</p>
<p><strong>TODO (admin):</strong> minimum order, pricing tiers, margins, territory rules, and requirements.</p>
<h2>Affiliate program</h2>
<p>For individuals who refer customers or resell on a smaller scale.</p>
<p><strong>TODO (admin):</strong> how affiliates sign up, how they earn, and payout rules.</p>
<h2>How to talk about these programs</h2>
<ul>
<li>Ask about their goals first: <em>"Ano po ang plano ninyo, pang-dagdag kita o full-time business?"</em></li>
<li>Never promise income. Share facts (price, contents, margin structure) and let them decide.</li>
<li>Hand over serious distributor leads to your manager. Territory and terms need approval.</li>
</ul>
$h$),

-- ============================================================ Module 2: Product Knowledge
('13000000-0000-4000-8000-000000000201', '11000000-0000-4000-8000-000000000002', 'How to learn any product', 1, 4, true, $h$
<p>For every product you sell, you must be able to answer these questions without looking. Customers trust salespeople who know their products.</p>
<ol>
<li>What is it, and what brand?</li>
<li>What sizes, and what is the price?</li>
<li>What are the main ingredients and <strong>allergens</strong>?</li>
<li>How long does it last, and how should it be stored?</li>
<li>How is it used? Give two or three menu ideas.</li>
<li>Who is it best for?</li>
<li>What are the top three reasons to buy it?</li>
<li>How does it compare with what the customer uses now?</li>
<li>What questions do customers usually ask?</li>
</ol>
<p>The product lessons that follow cover each line. Exact details for each product (sizes, prices, ingredients) live in the product records your admin maintains. <strong>If a detail says TODO, it has not been confirmed yet. Don't quote it to customers.</strong></p>
<blockquote>The AI customer in roleplays knows the product facts. If you state a wrong price or ingredient, it will catch you.</blockquote>
$h$),

('13000000-0000-4000-8000-000000000202', '11000000-0000-4000-8000-000000000002', 'ThyChef Flavored Powders', 2, 6, true, $h$
<p>ThyChef flavored powders are seasoning powders that food businesses shake or toss onto snacks to give them flavor.</p>
<h2>Flavors and size</h2>
<p>Sold in <strong>1 kg</strong> packs. Flavors include <strong>Cheese, Barbecue, Hot &amp; Spicy, Salted Egg and Ghost Chili</strong>. Other flavors such as sour cream may be available. <strong>TODO (admin):</strong> confirm the full flavor list and prices.</p>
<h2>Best customers</h2>
<ul>
<li>Fries, chicken and potato food carts and kiosks</li>
<li>Popcorn, chips and snack resellers</li>
<li>Restaurants and cafés with fries, wings or snack menus</li>
</ul>
<h2>Selling points</h2>
<ul>
<li>Lets a small stall offer several flavors from the same base product (fries, chicken, popcorn), which raises the average order.</li>
<li>Consistent flavor in every batch, so customers get the same taste every visit.</li>
<li>A 1 kg pack is economical for daily volume. <strong>TODO:</strong> servings per kg.</li>
</ul>
<h2>Questions to ask</h2>
<ul>
<li>"Ilan po ang naluluto ninyong fries per day?"</li>
<li>"Anong flavors ang pinaka-mabenta sa inyo ngayon?"</li>
<li>"Saan po kayo kumukuha ng powder ngayon, at okay po ba ang lasa at presyo?"</li>
</ul>
<p><strong>TODO (admin):</strong> ingredients, allergens (cheese and salted egg likely contain milk/egg, so confirm), shelf life and storage.</p>
$h$),

('13000000-0000-4000-8000-000000000203', '11000000-0000-4000-8000-000000000002', 'ThyChef Marinade and Breading Mix Powders', 3, 6, true, $h$
<h2>Marinade powders</h2>
<p>Seasoning powders mixed with water or oil to marinate meat (chicken, pork) before cooking. They save prep time and make the taste consistent.</p>
<h2>Breading mix powders</h2>
<p>Ready-to-use coating mixes for fried chicken, fish and vegetables. Listed at around <strong>₱450</strong> (placeholder from the website, so check the current price list).</p>
<h2>Best customers</h2>
<ul>
<li>Fried chicken stalls and franchises</li>
<li>Carinderias and restaurants with fried dishes</li>
<li>Cafeterias that cook in volume</li>
</ul>
<h2>Selling points</h2>
<ul>
<li>Consistent crunch and taste even when different staff cook.</li>
<li>Less preparation: no need to mix flour and spices in-house.</li>
<li>Pairs with ThyChef flavored powders: breaded chicken plus a flavor toss for a premium menu item.</li>
</ul>
<h2>Expect this objection</h2>
<p>Chefs often doubt powdered mixes ("mas masarap pa rin ang sariling timpla"). The best answer is a <strong>side-by-side demo or sample</strong>, not an argument.</p>
<p><strong>TODO (admin):</strong> sizes, yield per pack, ingredients, allergens (wheat), shelf life.</p>
$h$),

('13000000-0000-4000-8000-000000000204', '11000000-0000-4000-8000-000000000002', 'ThyChef Soup Powders and Dipping Cheese Powders', 4, 6, true, $h$
<h2>Soup powders</h2>
<p>Flavors: <strong>Chicken, Seafood and Noodle</strong>. Add water to make soup bases quickly and consistently.</p>
<p>Best for <strong>cafeterias</strong> (schools, offices, hospitals), carinderias and noodle houses that serve soup every day.</p>
<ul>
<li>Same taste every batch, whoever is cooking.</li>
<li>Faster prep for large volumes.</li>
<li>Institutional buyers care about documents and consistent supply, so be ready (see “Where our products come from”).</li>
</ul>
<h2>Dipping cheese powders</h2>
<p>Powder that is mixed to make a cheese dip or sauce, popular with fries, nachos and chicken.</p>
<p>Best for snack kiosks, fries and nachos carts, and cafés.</p>
<ul>
<li>Lets a stall sell a "with dip" upgrade at a higher price.</li>
<li>Easier to store than ready-made liquid cheese sauce. <strong>TODO:</strong> confirm storage and preparation.</li>
</ul>
<p><strong>TODO (admin):</strong> sizes, prices, preparation ratios, ingredients, allergens, shelf life.</p>
$h$),

('13000000-0000-4000-8000-000000000205', '11000000-0000-4000-8000-000000000002', 'Arkadia Syrups, Chai and Pyramid Tea Bags', 5, 6, true, $h$
<p><strong>Arkadia</strong> is our beverage line for cafés, milk tea shops and coffee kiosks.</p>
<h2>Premium Syrups</h2>
<p>Flavoring syrups for coffee, milk tea, fruit tea and desserts. Listed at around <strong>₱495</strong> (placeholder from the website, so check the current price list).</p>
<h2>Chai</h2>
<p>A spiced tea product for chai lattes. It helps cafés add a trendy, higher-margin drink.</p>
<h2>Pyramid Tea Bags</h2>
<p>Tea in pyramid-shaped bags, which leave more room for leaves to steep than flat bags. Good for cafés that want a premium hot or iced tea.</p>
<h2>Best customers</h2>
<ul><li>Milk tea shops</li><li>Cafés and coffee kiosks</li><li>Restaurants with a drinks menu</li></ul>
<h2>Selling points</h2>
<ul>
<li>Consistent flavor so every cup tastes the same.</li>
<li>Lets the shop launch new menu items (seasonal flavors, chai latte) with little extra effort.</li>
<li>Café owners compare <strong>cost per cup</strong>, so know it. <strong>TODO:</strong> servings per bottle.</li>
</ul>
<h2>Discovery questions</h2>
<ul>
<li>"Ilang cups po ang average ninyo per day?"</li>
<li>"Anong flavors ang top sellers ninyo?"</li>
<li>"Ano pong hindi ninyo gusto sa current supplier ninyo?"</li>
</ul>
<p><strong>TODO (admin):</strong> flavor list, sizes, ingredients, sugar content, shelf life once opened.</p>
$h$),

('13000000-0000-4000-8000-000000000206', '11000000-0000-4000-8000-000000000002', 'All Purpose Chili Garlic', 6, 4, true, $h$
<p>A ready-to-use chili garlic sauce in a <strong>120 g</strong> jar, listed at around <strong>₱150</strong> (placeholder from the website, so check the current price list).</p>
<h2>Uses</h2>
<ul>
<li>Table condiment for siomai, dumplings, noodles and fried dishes.</li>
<li>Cooking ingredient for stir-fries and sauces.</li>
</ul>
<h2>Best customers</h2>
<ul>
<li>Carinderias, siomai and dumpling stalls, noodle houses</li>
<li>Home cooks and resellers (sari-sari stores, online sellers)</li>
</ul>
<h2>Selling points</h2>
<ul>
<li>Consistent taste and heat. <strong>TODO:</strong> what makes it different from cheaper brands.</li>
<li>Easy entry product: a small first order to start a relationship with a new store.</li>
</ul>
<h2>Expect this objection</h2>
<p>"Mas mura po yung gamit namin." Talk about <strong>value</strong> (taste, how much is needed per serving, customer satisfaction), not just price. See the Objection Handling module.</p>
<p><strong>TODO (admin):</strong> ingredients, allergens, shelf life, bulk sizes for food businesses.</p>
$h$),

-- ============================================================ Module 3: Customer Types
('13000000-0000-4000-8000-000000000301', '11000000-0000-4000-8000-000000000003', 'Restaurants', 1, 5, true, $h$
<h2>Who decides</h2><p>The owner, the head chef, or a purchasing staff member. Chefs care about taste; owners care about cost and consistency.</p>
<h2>What they care about</h2>
<ul><li>Taste and quality, because it is their reputation</li><li>Consistency across cooks and shifts</li><li>Food cost per serving</li><li>Reliable delivery</li></ul>
<h2>Products that fit</h2><p>Breading mixes, marinade powders, soup powders, flavored powders for appetizers, chili garlic, Arkadia syrups for drinks.</p>
<h2>How to approach</h2>
<ul><li>Visit outside peak hours (around 2–4 PM).</li><li>Offer a sample or demo. Chefs believe what they taste.</li><li>Ask about menu items that are inconsistent or slow to prepare.</li></ul>
<p><strong>Watch out:</strong> chefs can be skeptical of powders. Don't argue. Prove it with a test.</p>
$h$),

('13000000-0000-4000-8000-000000000302', '11000000-0000-4000-8000-000000000003', 'Food stalls, kiosks and food carts', 2, 5, true, $h$
<h2>Who decides</h2><p>Usually the owner, often also the cook. Franchise stalls may have to follow head-office suppliers, so ask.</p>
<h2>What they care about</h2>
<ul><li>Low cost and small minimum orders</li><li>Products that sell fast and look good</li><li>Easy preparation by one or two staff</li></ul>
<h2>Products that fit</h2><p>ThyChef flavored powders, dipping cheese powders, breading mix, chili garlic.</p>
<h2>How to approach</h2>
<ul><li>Talk about <strong>more flavors means more sales</strong>: offering cheese, BBQ and sour cream from one base product.</li><li>Calculate cost per serving and the extra they can charge for a flavor or dip.</li><li>Start small: one or two flavors as a trial.</li></ul>
<p><strong>Watch out:</strong> cash flow is tight. Be clear on payment terms from the start.</p>
$h$),

('13000000-0000-4000-8000-000000000303', '11000000-0000-4000-8000-000000000003', 'Cafeterias (schools, offices, hospitals)', 3, 5, true, $h$
<h2>Who decides</h2><p>A purchasing officer or canteen concessionaire. Big institutions often have a formal approval process.</p>
<h2>What they care about</h2>
<ul><li>Consistency and food safety</li><li><strong>Documents</strong>: business permits, FDA registration, sometimes accreditation as a supplier</li><li>Stable price and reliable supply for the whole term</li><li>Proper invoicing and payment terms</li></ul>
<h2>Products that fit</h2><p>Soup powders, marinade and breading mixes, chili garlic.</p>
<h2>How to approach</h2>
<ul><li>Bring or offer documents early. It shows you are serious.</li><li>Ask about their volume, menu cycle and how they choose suppliers.</li><li>Expect a longer sales cycle. Schedule follow-ups.</li></ul>
<p><strong>TODO (admin):</strong> list of documents JD Foods can provide and how to request them.</p>
$h$),

('13000000-0000-4000-8000-000000000304', '11000000-0000-4000-8000-000000000003', 'Cafés and milk tea shops', 4, 5, true, $h$
<h2>Who decides</h2><p>The owner or the store manager or barista lead.</p>
<h2>What they care about</h2>
<ul><li>Flavor and trend: new drinks bring customers</li><li>Cost per cup and margin</li><li>Consistency across baristas</li><li>Supplier reliability. Running out of a best-seller hurts.</li></ul>
<h2>Products that fit</h2><p>Arkadia syrups, chai, pyramid tea bags; flavored and dipping powders for snack items.</p>
<h2>How to approach</h2>
<ul><li>Ask for their top three drinks and which flavors they wish they had.</li><li>Offer a tasting or sample bottle for a trial menu item.</li><li>Compare cost per cup with their current supplier, using facts only.</li></ul>
$h$),

('13000000-0000-4000-8000-000000000305', '11000000-0000-4000-8000-000000000003', 'Home cooks and resellers', 5, 4, true, $h$
<h2>Who they are</h2><p>Home cooks, small online sellers, sari-sari stores and people reselling in their community.</p>
<h2>What they care about</h2>
<ul><li>Small pack sizes and affordable price</li><li>Products that are easy to explain and resell</li><li>Fast payment and pick-up or delivery</li></ul>
<h2>Products that fit</h2><p>All Purpose Chili Garlic, flavored powders in smaller quantities, business packages for those who want to grow.</p>
<h2>How to approach</h2>
<ul><li>Keep it simple: price, how to use, how they can earn.</li><li>For ambitious resellers, mention the affiliate program or business packages (facts only, no income promises).</li></ul>
$h$),

('13000000-0000-4000-8000-000000000306', '11000000-0000-4000-8000-000000000003', 'Distributors', 6, 5, true, $h$
<h2>Who they are</h2><p>Businesses that buy in volume and resell to stores and food businesses in their area, often in other provinces (for example Cebu or Mindanao).</p>
<h2>What they care about</h2>
<ul><li><strong>Margins</strong> and price tiers</li><li><strong>Territory</strong>: will we sell to others in their area?</li><li>Minimum orders, payment terms and delivery to their location</li><li>Marketing support and how fast the products sell</li></ul>
<h2>How to approach</h2>
<ul><li>Ask about their current lines, customers, coverage area and volume.</li><li>Share only approved terms. <strong>Territory and special pricing need manager approval.</strong></li><li>Qualify, then bring your manager in for serious leads.</li></ul>
<p><strong>TODO (admin):</strong> distributor terms summary (see the distributorship lesson).</p>
$h$),

-- ============================================================ Module 4: Sales Scripts
('13000000-0000-4000-8000-000000000401', '11000000-0000-4000-8000-000000000004', 'Cold call', 1, 6, true, $h$
<p>A cold call is your first call to someone who doesn't know you. Your only goal is to <strong>earn a next step</strong>: a visit, a sampling, or permission to send information. Don't try to close a big order on the first call.</p>
<h2>Flow</h2>
<ol>
<li><strong>Greet and introduce</strong> (10 seconds).</li>
<li><strong>Ask for time</strong>, respecting that they are busy.</li>
<li><strong>Give a reason to listen</strong>: one benefit relevant to their business.</li>
<li><strong>Ask one or two questions.</strong></li>
<li><strong>Ask for the next step.</strong></li>
</ol>
<h2>Example</h2>
<blockquote>"Good morning po! Si Ana po ito from JD Foods. Supplier po kami ng flavored powders at sauces para sa mga food business. May 30 seconds lang po ba kayo?"</blockquote>
<blockquote>"Nakakatulong po kami sa mga fries at chicken stalls na magdagdag ng flavors tulad ng cheese at BBQ para tumaas ang benta. Kayo po, ilang flavors ang offer ninyo ngayon?"</blockquote>
<blockquote>"Pwede po ba akong dumaan this week para mag-iwan ng sample? Mas okay po ba ang Tuesday o Thursday?"</blockquote>
<h2>If they are busy</h2>
<blockquote>"Naiintindihan ko po. Kailan po ang magandang oras para tumawag ulit, mamayang hapon o bukas ng umaga?"</blockquote>
<p>Offer two choices instead of a yes/no question. Always end with a specific time.</p>
$h$),

('13000000-0000-4000-8000-000000000402', '11000000-0000-4000-8000-000000000004', 'Walk-in visit', 2, 6, true, $h$
<h2>Before you go in</h2>
<ul><li>Observe: what do they sell, how busy are they, what brands do you see?</li><li>Avoid peak hours (lunch and dinner rush).</li><li>Bring samples, the price list and your calling card.</li></ul>
<h2>Flow</h2>
<ol><li>Greet and ask for the owner or person in charge.</li><li>Introduce yourself and JD Foods in one sentence.</li><li>Compliment something genuine about their business.</li><li>Ask discovery questions.</li><li>Recommend one or two products that match what you heard.</li><li>Offer a sample or trial, and agree on a follow-up.</li></ol>
<h2>Example</h2>
<blockquote>"Magandang hapon po! Andiyan po ba si owner? Si Mark po ito from JD Foods. Supplier po kami ng seasoning powders at sauces."</blockquote>
<blockquote>"Ang dami po ninyong customer kanina ah! Ano pong pinaka-mabenta ninyo?"</blockquote>
<blockquote>"Base sa sinabi ninyo, baka po bagay sa inyo ang ThyChef Cheese at BBQ powder. Iiwanan ko po kayo ng sample. Babalik po ako sa Friday para malaman kung nagustuhan ng customers ninyo, okay lang po ba?"</blockquote>
$h$),

('13000000-0000-4000-8000-000000000403', '11000000-0000-4000-8000-000000000004', 'Follow-up', 3, 5, true, $h$
<p>Most sales happen on the follow-up, not the first visit. A follow-up must have a <strong>reason</strong> and a <strong>next step</strong>.</p>
<h2>Good reasons to follow up</h2>
<ul><li>To get feedback on a sample</li><li>To send information you promised</li><li>A new product or promo that fits their needs</li><li>A scheduled re-order date</li></ul>
<h2>Example</h2>
<blockquote>"Hello po Ma'am Liza, si Ana po from JD Foods. Follow up lang po sa sample ng BBQ powder na iniwan ko last week. Kumusta po ang feedback ng customers ninyo?"</blockquote>
<blockquote>"Natutuwa po akong marinig 'yan! Para po hindi kayo maubusan, pwede po nating i-order ang 2 kilos para sa susunod na linggo. Okay lang po ba?"</blockquote>
<h2>Rules</h2>
<ul><li>Follow up when you said you would. This is integrity in action.</li><li>Log every follow-up and its outcome (see SOP: CRM and reporting).</li><li>After three no-replies, ask your manager whether to keep the lead or move on.</li></ul>
$h$),

('13000000-0000-4000-8000-000000000404', '11000000-0000-4000-8000-000000000004', 'Product demo and sampling', 4, 6, true, $h$
<p>Tasting beats talking. A good demo turns a doubtful buyer into a believer.</p>
<h2>Before the demo</h2>
<ul><li>Agree on the time and on what you will cook or prepare.</li><li>Ask what they currently use, so you can do a side-by-side comparison if possible.</li><li>Bring enough product, plus clean utensils and containers.</li></ul>
<h2>During the demo</h2>
<ol><li>Explain what you will show and why it matters to <em>them</em>.</li><li>Let their staff do the cooking if possible. It proves anyone can get consistent results.</li><li>Ask them to taste and compare, then ask open questions: <em>"Ano pong napansin ninyo sa lasa at texture?"</em></li><li>Connect the result to their goals: cost, speed, consistency, customer satisfaction.</li></ol>
<h2>After the demo</h2>
<blockquote>"Ano pong masasabi ninyo? Kung okay po sa inyo, simulan po natin sa trial order na 5 kilos para masubukan ninyo sa actual na benta."</blockquote>
<p>Always ask for a decision or a next step before you leave.</p>
$h$),

('13000000-0000-4000-8000-000000000405', '11000000-0000-4000-8000-000000000004', 'Closing', 5, 6, true, $h$
<p>Closing means <strong>asking for the order or a clear commitment</strong>. Many salespeople do everything right and then forget to ask.</p>
<h2>Buying signals</h2>
<ul><li>Questions about price, delivery or payment</li><li>"Paano kung mag-order kami…"</li><li>Positive comments after tasting</li></ul>
<h2>Closing techniques</h2>
<h3>Direct ask</h3><blockquote>"Pwede na po ba nating i-process ang order ninyo ngayon?"</blockquote>
<h3>Choice close</h3><blockquote>"Gusto po ba ninyong magsimula sa 3 kilos o sa 5 kilos?"</blockquote>
<h3>Trial close</h3><blockquote>"Kung masubukan po ninyo ito ng isang linggo at magustuhan ng customers ninyo, ire-regular na po ba natin?"</blockquote>
<h3>Summary close</h3><blockquote>"So po, consistent na lasa, mas mabilis ang prep, at may delivery kami tuwing Tuesday. I-schedule ko na po ba ang first delivery?"</blockquote>
<h2>Rules</h2>
<ul><li>Ask, then stay quiet and let them answer.</li><li>If they say no, find out why. That is just an objection to handle.</li><li>Never pressure or invent a fake deadline.</li><li>Confirm every detail of the order (see SOP: Order taking).</li></ul>
$h$),

('13000000-0000-4000-8000-000000000406', '11000000-0000-4000-8000-000000000004', 'Upsell and cross-sell', 6, 5, true, $h$
<p><strong>Upsell</strong> means a bigger size or quantity of what they buy. <strong>Cross-sell</strong> means a related product that goes with it. Do it to help the customer, never just to increase the order.</p>
<h2>Natural pairings</h2>
<ul>
<li>Breading mix → flavored powders (breaded chicken with cheese or BBQ toss)</li>
<li>Fries with flavored powder → dipping cheese powder (a "with dip" upgrade)</li>
<li>Arkadia syrups → chai or pyramid tea bags for new drinks</li>
<li>Siomai or noodles → chili garlic</li>
</ul>
<h2>Example</h2>
<blockquote>"Since mabenta po ang cheese fries ninyo, marami pong stalls ang nagdadagdag ng cheese dip at may dagdag ₱10–15 per order. Gusto po ba ninyong subukan ang dipping cheese powder?"</blockquote>
<h2>Rules</h2>
<ul><li>Base the suggestion on what they told you.</li><li>One suggestion at a time.</li><li>If their volume doesn't justify a bigger size, don't push it. That is win-win collaboration.</li></ul>
$h$),

('13000000-0000-4000-8000-000000000407', '11000000-0000-4000-8000-000000000004', 'Re-order', 7, 5, true, $h$
<p>Keeping a customer is cheaper than finding a new one. Re-orders are where your monthly numbers come from.</p>
<h2>Know your customer's cycle</h2>
<ul><li>How much do they use per week?</li><li>When did they last order, and how much?</li><li>Call or visit <strong>before</strong> they run out.</li></ul>
<h2>Example</h2>
<blockquote>"Hi po Sir Ben! Base po sa last order ninyo, malapit na pong maubos ang breading mix ninyo. I-schedule ko na po ba ang same order para sa Thursday delivery?"</blockquote>
<h2>Use every re-order call to</h2>
<ul><li>Check satisfaction: <em>"Kumusta po ang feedback sa product?"</em></li><li>Solve problems early: delivery, quality, payment</li><li>Suggest one relevant add-on</li></ul>
<p>If a regular customer misses their usual re-order date, call them. A late re-order can be an early warning that they are switching suppliers.</p>
$h$),

-- ============================================================ Module 5: Objection Handling
('13000000-0000-4000-8000-000000000501', '11000000-0000-4000-8000-000000000005', 'The LAER method', 1, 5, true, $h$
<p>An objection is not a "no". It usually means the customer needs more information or more confidence. Use <strong>LAER</strong>:</p>
<ol>
<li><strong>Listen</strong>: let them finish. Don't interrupt.</li>
<li><strong>Acknowledge</strong>: show you understand. <em>"Naiintindihan ko po."</em> (This is not agreeing.)</li>
<li><strong>Explore</strong>: ask a question to find the real concern. <em>"Para lang po malinaw, ano pong pinaka-concern ninyo, ang presyo o ang lasa?"</em></li>
<li><strong>Respond</strong>: answer the real concern with facts, proof or options. Then check: <em>"Makatwiran po ba 'yon?"</em></li>
</ol>
<h2>Never</h2>
<ul><li>Argue or say the customer is wrong</li><li>Badmouth competitors</li><li>Make up facts or promises to win the sale</li></ul>
<p>The next lessons apply LAER to the six objections you will hear most.</p>
$h$),

('13000000-0000-4000-8000-000000000502', '11000000-0000-4000-8000-000000000005', '"Mas mura sa iba" (price)', 2, 6, true, $h$
<p>The most common objection. Usually the customer is comparing the <strong>price per pack</strong>, not the <strong>value</strong>.</p>
<h2>Explore</h2>
<blockquote>"Naiintindihan ko po, mahalaga talaga ang gastos. Magkano po ang binabayaran ninyo ngayon, at gaano po katagal bago maubos?"</blockquote>
<h2>Respond with value</h2>
<ul>
<li><strong>Cost per serving</strong>: if less product is needed per serving, the real cost can be lower.</li>
<li><strong>Consistency</strong>: fewer wasted batches and fewer complaints.</li>
<li><strong>Sales impact</strong>: better taste can mean more repeat customers or a higher selling price.</li>
<li><strong>Service</strong>: reliable delivery and support.</li>
</ul>
<blockquote>"Kung ikukumpara po natin per serving, halos pareho lang po. Pero mas consistent po ang lasa kaya mas kaunti ang reklamo at sayang. Gusto po ba ninyong subukan side-by-side?"</blockquote>
<h2>Options</h2>
<ul><li>Start with a smaller trial order.</li><li>Suggest a size that fits their volume better.</li><li>Discounts follow the approval rules in the SOP. Never promise a discount you are not allowed to give.</li></ul>
$h$),

('13000000-0000-4000-8000-000000000503', '11000000-0000-4000-8000-000000000005', '"May supplier na kami" (current supplier loyalty)', 3, 5, true, $h$
<p>Loyalty is a good sign: it means they value reliability. Don't attack their supplier. Aim to become their <strong>second option</strong> first.</p>
<h2>Explore</h2>
<blockquote>"Maganda po 'yan na may maaasahan na kayong supplier. Gaano na po kayo katagal sa kanila? May mga pagkakataon po bang naubusan sila o na-late ang delivery?"</blockquote>
<h2>Respond</h2>
<ul>
<li>Position JD Foods as a backup for when their supplier runs out.</li>
<li>Offer a product they don't currently get from that supplier (cross-sell entry).</li>
<li>Offer a sample for a side-by-side test. No commitment needed.</li>
</ul>
<blockquote>"Hindi ko naman po kayo pinapalipat agad. Pero para po may backup kayo kung sakaling maubusan, pwede ko po kayong iwanan ng sample at price list?"</blockquote>
$h$),

('13000000-0000-4000-8000-000000000504', '11000000-0000-4000-8000-000000000005', 'Quality doubts', 4, 5, true, $h$
<p>"Baka hindi masarap", "Powder lang 'yan", "Hindi ko kilala ang brand." Quality doubts are answered with <strong>proof</strong>, not adjectives.</p>
<h2>Explore</h2>
<blockquote>"Naiintindihan ko po, ayaw ninyong ma-risk ang lasa ng menu ninyo. Ano po ang pinaka-importante sa inyo, lasa, texture o consistency?"</blockquote>
<h2>Proof you can offer</h2>
<ul>
<li>A tasting or demo, ideally side-by-side with what they use</li>
<li>A small trial order</li>
<li>Product documents (registration, certificates) where available. <strong>TODO:</strong> list in SOPs.</li>
<li>Names of happy customers <em>only if they agreed to be referenced</em></li>
</ul>
<blockquote>"Mas maganda po kung kayo mismo ang tumikim. Pwede po ba akong mag-demo bukas ng hapon gamit ang manok ninyo?"</blockquote>
$h$),

('13000000-0000-4000-8000-000000000505', '11000000-0000-4000-8000-000000000005', 'Minimum order', 5, 4, true, $h$
<p>Small businesses worry about cash and storage. "Ang laki naman ng minimum."</p>
<h2>Explore</h2>
<blockquote>"Gaano po karami ang nagagamit ninyo sa isang linggo?"</blockquote>
<h2>Respond</h2>
<ul>
<li>Show how long the minimum order will last based on their usage.</li>
<li>Combine products to reach the minimum (for example two flavors instead of one).</li>
<li>Explain proper storage and shelf life so they know it won't go to waste.</li>
<li>If they truly can't meet it, point them to a reseller or distributor near them.</li>
</ul>
<p><strong>TODO (admin):</strong> actual minimum order amounts per customer type.</p>
$h$),

('13000000-0000-4000-8000-000000000506', '11000000-0000-4000-8000-000000000005', 'Payment terms', 6, 4, true, $h$
<p>"Pwede bang 30 days?" "Cash on delivery lang ba?" Payment terms are company policy, not something to negotiate on the spot.</p>
<h2>Explore</h2>
<blockquote>"Ano po ang usual na terms ninyo sa ibang suppliers?"</blockquote>
<h2>Respond</h2>
<ul>
<li>State the standard terms clearly. <strong>TODO (admin):</strong> standard terms per customer type.</li>
<li>Explain how a customer can qualify for credit terms (for example after a number of on-time orders). <strong>TODO:</strong> policy.</li>
<li>For special requests, say you will check with your manager, then follow up.</li>
</ul>
<blockquote>"Ang standard po namin ay ____. Pero ipapaalam ko po sa manager ko ang request ninyo at babalikan ko po kayo bukas."</blockquote>
$h$),

('13000000-0000-4000-8000-000000000507', '11000000-0000-4000-8000-000000000005', '"Pag-iisipan ko muna"', 7, 5, true, $h$
<p>"I'll think about it" usually hides a real concern the customer hasn't said yet.</p>
<h2>Explore politely</h2>
<blockquote>"Sige po, naiintindihan ko. Para po matulungan ko kayong magdesisyon, may specific po ba kayong gustong pag-isipan, ang presyo, ang lasa, o ang dami ng order?"</blockquote>
<h2>Respond</h2>
<ul>
<li>If a concern comes out, handle it with LAER.</li>
<li>Offer a low-risk step: a sample, a small trial, or a demo.</li>
<li>If they still need time, <strong>agree on a specific follow-up</strong>: <em>"Tatawag po ako sa Thursday ng umaga, okay lang po ba?"</em></li>
</ul>
<p>Never leave with an open-ended "sige, balitaan n'yo na lang ako".</p>
$h$),

-- ============================================================ Module 6: SOPs
('13000000-0000-4000-8000-000000000601', '11000000-0000-4000-8000-000000000006', 'Order taking', 1, 5, true, $h$
<p>A wrong order costs money and trust. Confirm every order the same way.</p>
<h2>Checklist</h2>
<ol>
<li>Customer name, business name and contact number</li>
<li>Exact products, sizes and quantities</li>
<li>Price per item and total (current price list only)</li>
<li>Delivery address, preferred date and time window</li>
<li>Payment method and terms</li>
<li><strong>Read the order back</strong> to the customer and get their confirmation</li>
</ol>
<blockquote>"I-confirm ko lang po: 3 kilos ThyChef Cheese, 2 kilos BBQ, delivery sa Thursday ng umaga, cash on delivery. Tama po ba?"</blockquote>
<p><strong>TODO (admin):</strong> how orders are submitted (form, app, Viber group, system), cut-off times, and who processes them.</p>
$h$),

('13000000-0000-4000-8000-000000000602', '11000000-0000-4000-8000-000000000006', 'Pricing and discount approval', 2, 4, true, $h$
<ul>
<li>Always quote from the <strong>current official price list</strong>. Never from memory or old lists.</li>
<li>You may not give discounts beyond your approval limit. Promising one you can't give hurts the customer relationship and the company.</li>
<li>If a customer asks for a special price, get the details (volume, frequency, competitor price) and bring it to your manager.</li>
</ul>
<h2>Fill in before launch</h2>
<ul>
<li><strong>TODO (admin):</strong> where the current price list is kept.</li>
<li><strong>TODO (admin):</strong> discount limits for salespeople and managers.</li>
<li><strong>TODO (admin):</strong> how to request approval and how long it takes.</li>
</ul>
$h$),

('13000000-0000-4000-8000-000000000603', '11000000-0000-4000-8000-000000000006', 'Delivery', 3, 4, true, $h$
<ul>
<li>Only promise delivery dates that match the delivery schedule. If unsure, check first.</li>
<li>Tell the customer what to expect: date, time window, who will deliver.</li>
<li>If a delivery will be late, the customer should hear it <strong>from you first</strong>, with a new date.</li>
</ul>
<h2>Fill in before launch</h2>
<ul>
<li><strong>TODO (admin):</strong> delivery days per area and cut-off times.</li>
<li><strong>TODO (admin):</strong> delivery fees or minimums, if any.</li>
<li><strong>TODO (admin):</strong> who to contact about delivery problems.</li>
</ul>
$h$),

('13000000-0000-4000-8000-000000000604', '11000000-0000-4000-8000-000000000006', 'Payment collection', 4, 4, true, $h$
<ul>
<li>Collect according to the agreed terms. Always issue the proper receipt.</li>
<li>Remind customers politely before the due date, not only after.</li>
<li>Record every payment collected the same day.</li>
<li>Never hold company money longer than the policy allows.</li>
</ul>
<blockquote>"Good morning po! Paalala lang po na due na po bukas ang payment para sa order noong ika-5. Kailan po kayo available para sa collection?"</blockquote>
<p><strong>TODO (admin):</strong> accepted payment methods, remittance rules and deadlines, and what to do with overdue accounts.</p>
$h$),

('13000000-0000-4000-8000-000000000605', '11000000-0000-4000-8000-000000000006', 'Returns', 5, 4, true, $h$
<ul>
<li>Listen to the complaint fully and stay calm. Thank them for telling you.</li>
<li>Get the details: product, batch or expiry date, quantity, photos, and what happened.</li>
<li>Do not promise a refund or replacement before it is approved, unless the policy allows you to.</li>
<li>Follow up with the customer until it is resolved.</li>
</ul>
<p><strong>TODO (admin):</strong> what can be returned, within how many days, and the approval steps.</p>
$h$),

('13000000-0000-4000-8000-000000000606', '11000000-0000-4000-8000-000000000006', 'CRM and reporting', 6, 4, true, $h$
<p>If it is not recorded, it didn't happen. Good records let your manager help you and keep customers from being forgotten when someone leaves.</p>
<h2>Record after every contact</h2>
<ul><li>Who you talked to and when</li><li>What they need and which products you discussed</li><li>Objections raised</li><li>The agreed next step and date</li></ul>
<p><strong>TODO (admin):</strong> which tool to use (CRM, spreadsheet, app), daily and weekly report format, and deadlines.</p>
$h$),

('13000000-0000-4000-8000-000000000607', '11000000-0000-4000-8000-000000000006', 'Daily and weekly call quotas', 7, 3, true, $h$
<p>Sales is a numbers game backed by quality conversations. Quotas keep your pipeline full.</p>
<h2>Fill in before launch</h2>
<ul>
<li><strong>TODO (admin):</strong> calls or visits per day.</li>
<li><strong>TODO (admin):</strong> new accounts per month.</li>
<li><strong>TODO (admin):</strong> how quotas are tracked and reviewed with your manager.</li>
</ul>
<h2>Tips</h2>
<ul><li>Plan tomorrow's route and calls today.</li><li>Group visits by area to save travel time.</li><li>Block time for follow-ups. They close more deals than new calls.</li></ul>
$h$)
on conflict (id) do nothing;
