/**
 * SAMPLE DATA for the /demo preview only. Not real people or results.
 * Lesson, quiz and scenario titles match the seeded content.
 */

export const demoRep = { name: "Ana Reyes", team: "Sales Team A · Main Office", hired: "2026-11-10", level: 1, levelName: "Product Ready", nextLevel: "Field Ready", skillScore: 64 };

export const demoModules = [
  { title: "About JD Foods", status: "done", lessons: ["Welcome to JD Foods", "Our mission and values", "Where our products come from", "Distributorship, affiliate programs and business packages"], completed: 4, quiz: "About JD Foods quiz" },
  { title: "Product Knowledge", status: "done", lessons: ["How to learn any product", "ThyChef Flavored Powders", "ThyChef Marinade and Breading Mix Powders", "ThyChef Soup Powders and Dipping Cheese Powders", "Arkadia Syrups, Chai and Pyramid Tea Bags", "All Purpose Chili Garlic"], completed: 6, quiz: "Product Knowledge quiz" },
  { title: "Customer Types", status: "progress", lessons: ["Restaurants", "Food stalls, kiosks and food carts", "Cafeterias (schools, offices, hospitals)", "Cafés and milk tea shops", "Home cooks and resellers", "Distributors"], completed: 4, quiz: "Customer Types quiz" },
  { title: "Sales Scripts", status: "locked", lessons: ["Cold call", "Walk-in visit", "Follow-up", "Product demo and sampling", "Closing", "Upsell and cross-sell", "Re-order"], completed: 0, quiz: "Sales Scripts quiz" },
  { title: "Objection Handling", status: "locked", lessons: ["The LAER method", "\"Mas mura sa iba\" (price)", "\"May supplier na kami\"", "Quality doubts", "Minimum order", "Payment terms", "\"Pag-iisipan ko muna\""], completed: 0, quiz: "Objection Handling quiz" },
  { title: "SOPs", status: "locked", lessons: ["Order taking", "Pricing and discount approval", "Delivery", "Payment collection", "Returns", "CRM and reporting", "Daily and weekly call quotas"], completed: 0, quiz: "SOPs quiz" },
] as const;

export const demoQuizHistory = [
  { quiz: "About JD Foods quiz", date: "2026-11-12T09:20:00+08:00", score: 92, passed: true },
  { quiz: "Product Knowledge quiz", date: "2026-11-15T14:05:00+08:00", score: 83, passed: true },
  { quiz: "Product Knowledge quiz", date: "2026-11-14T16:40:00+08:00", score: 67, passed: false },
];

export const demoLessonHtml = `
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
<ul><li>Start with a smaller trial order.</li><li>Suggest a size that fits their volume better.</li><li>Discounts follow the approval rules in the SOP. Never promise a discount you are not allowed to give.</li></ul>`;

export const demoQuiz = [
  {
    id: "q1", type: "mcq" as const, prompt: "From which three countries does JD Foods import products?",
    options: [{ id: "a", text: "Japan, Korea and the USA" }, { id: "b", text: "Thailand, China and Australia" }, { id: "c", text: "Vietnam, Indonesia and Malaysia" }, { id: "d", text: "China, India and Australia" }],
    correct: "b", explanation: "JD Foods sources imported products from Thailand, China and Australia.",
  },
  {
    id: "q2", type: "tf" as const, prompt: "If a customer asks something you don't know, it is better to give your best guess than to risk losing the sale.",
    options: [], correct: false, explanation: "Integrity: never invent facts. Say you will check, then follow up.",
  },
  {
    id: "q3", type: "scenario" as const, prompt: 'A fries cart owner says: "Bakit pa ako bibili ng flavored powder? Okay naman ang plain fries ko." What do you say?',
    options: [], correct: null,
    explanation: "Sell the benefit to their business (more flavors, more sales), then offer a low-risk trial.",
    aiFeedback: "You explained how flavors can raise sales and offered a small trial. Nice! Next time, ask about their daily volume first so your suggestion fits.",
  },
];

export const demoScenarios = [
  { id: "nena", title: "Aling Nena's carinderia: switching chili garlic", difficulty: "easy", place: "Carinderia · Quezon City", briefing: "It's 2:30 PM, after the lunch rush. Siomai and pancit are on the menu, and there's a jar of a cheap chili garlic brand on every table.", goal: "Get a small trial order of All Purpose Chili Garlic.", best: 77 },
  { id: "cart", title: "Fries and chicken cart: adding flavored powders", difficulty: "easy", place: "Food cart · Marikina", briefing: "A fried chicken and fries cart in a mall food strip. It only sells plain salted fries and original chicken.", goal: "Get a trial order of at least two flavored powder flavors.", best: 81 },
  { id: "cafe", title: "Milk tea café: Arkadia syrups and chai", difficulty: "medium", place: "Milk tea café · Pasig", briefing: "A scheduled 15-minute meeting with the owner before opening. She is \"open to options\".", goal: "Get her to agree to a tasting session or a trial order.", best: null },
  { id: "school", title: "School cafeteria: soup powders and documents", difficulty: "medium", place: "School cafeteria · Santa Rosa, Laguna", briefing: "The purchasing officer of a cafeteria serving 1,200 students gave you 20 minutes.", goal: "Agree on a product sampling and on sending the required documents.", best: null },
  { id: "cold", title: "Cold call: busy eatery owner", difficulty: "medium", place: "Pares and silog eatery · Sampaloc, Manila", briefing: "You're cold-calling at 11:15 AM, close to her lunch rush. She picks up.", goal: "Get permission for a specific callback time or a short visit.", best: null },
  { id: "chef", title: "Skeptical chef: powdered breading mix", difficulty: "hard", place: "Restaurant · Quezon City", briefing: "The head chef, known for his fried chicken, gives you \"five minutes\" at the kitchen pass.", goal: "Book a side-by-side demo of the breading mix in his kitchen.", best: null },
  { id: "cebu", title: "Prospective distributor in Cebu", difficulty: "hard", place: "Supply business · Mandaue City", briefing: "A grocery and food-service supplier wants to become a JD Foods distributor. Video call.", goal: "Qualify her and set a follow-up meeting with your sales manager.", best: null },
  { id: "late", title: "Angry regular customer: late delivery", difficulty: "hard", place: "2 fried chicken stalls · Caloocan", briefing: "A regular customer calls. His breading mix delivery is three days late.", goal: "Calm him down, own the problem, and keep his weekly re-order.", best: null },
] as const;

/** Scripted Aling Nena conversation for the chat demo. */
export const demoScript: { rep: string; customer: string }[] = [
  {
    rep: "Magandang hapon po! Kayo po ba si Aling Nena? Si Ana po ito from JD Foods. Supplier po kami ng sauces at seasonings para sa mga kainan.",
    customer: "Ay oo, ako nga. Anong kailangan mo, anak? Kakatapos lang ng lunch, medyo pagod pa ako.",
  },
  {
    rep: "Pasensya na po sa abala. Ang dami po ninyong customer kanina ah! Ano po ang pinaka-mabenta ninyo?",
    customer: "Siomai at pancit. Lalo na yung siomai, suki ko yung mga jeepney driver diyan.",
  },
  {
    rep: "Ang galing po! Napansin ko po may chili garlic sa bawat mesa. Okay po ba sa mga suki ninyo yung gamit ninyo ngayon?",
    customer: "Hmm... minsan may nagrereklamo na masyadong mamantika daw, tsaka iba-iba ang anghang. Pero mura kasi yun sa palengke.",
  },
  {
    rep: "Naiintindihan ko po. Yung All Purpose Chili Garlic po namin, 120 grams, consistent ang lasa at anghang. Pwede ko po bang ipatikim sa inyo?",
    customer: "Magkano ba yan?",
  },
  {
    rep: "Around ₱150 po per jar.",
    customer: "Ay, ang mahal naman! Yung sa palengke, mas mura doon.",
  },
  {
    rep: "Opo, mas mura po per jar. Pero kung mas kaunti po ang reklamo at bumalik-balik ang mga driver para sa siomai ninyo, sulit naman po. Subukan po natin ng isang linggo, dalawang jar lang po muna?",
    customer: "Sige na nga, dalawa muna. Pag nagustuhan ng mga suki ko, oorder ako ulit.",
  },
];

export const demoResult = {
  overall: 77,
  goalAchieved: true,
  summary: "You built rapport naturally and uncovered her real problem before pitching. Next time, quote the exact price list and lead with value before the price comes up.",
  scores: { opening: 4, discovery: 4, product: 3, value: 3, objections: 4, closing: 4, communication: 5 },
  strengths: [
    "Warm, respectful opening that matched her mood (\"Pasensya na po sa abala\").",
    "Asked about her best sellers and noticed the chili garlic on the tables, which uncovered the oily, inconsistent-heat complaint.",
    "Asked for a small, concrete trial (two jars, one week) instead of a big order.",
  ],
  improvements: [
    { issue: "You said \"around ₱150\". Customers trust exact prices from the current list.", better_line: "₱150 po per jar, base sa current price list namin." },
    { issue: "You gave the price before connecting it to her customers' complaint, so it felt expensive.", better_line: "Bago po ang presyo: ilang jar po ang nauubos ninyo sa isang linggo? Para makita natin ang gastos per serving." },
    { issue: "You didn't confirm a follow-up date to check if her suki liked it.", better_line: "Babalikan ko po kayo sa Friday para malaman ang feedback ng mga suki ninyo, okay lang po ba?" },
  ],
  factualErrors: [] as { claim: string; correction: string }[],
};

export const demoTeam = [
  { name: "Paolo Lim", hired: "2026-08-04", level: 3, levelName: "Competent", score: 82, onboarding: 100, lastActive: "Today", atRisk: null },
  { name: "Mark Dela Cruz", hired: "2026-10-01", level: 2, levelName: "Field Ready", score: 71, onboarding: 78, lastActive: "Today", atRisk: null },
  { name: "Ana Reyes", hired: "2026-11-10", level: 1, levelName: "Product Ready", score: 64, onboarding: 38, lastActive: "Today", atRisk: null },
  { name: "Liza Garcia", hired: "2026-11-03", level: 1, levelName: "Product Ready", score: 55, onboarding: 45, lastActive: "Yesterday", atRisk: "Failed SOPs quiz 3 times" },
  { name: "Joy Santos", hired: "2026-11-17", level: 0, levelName: "Trainee", score: 22, onboarding: 8, lastActive: "4 days ago", atRisk: "Inactive 4 days" },
];

export const demoReviewQueue = [
  { rep: "Ana Reyes", scenario: "Aling Nena's carinderia: switching chili garlic", difficulty: "easy", date: "Today, 2:41 PM", score: 77 },
  { rep: "Mark Dela Cruz", scenario: "Skeptical chef: powdered breading mix", difficulty: "hard", date: "Today, 11:02 AM", score: 58 },
  { rep: "Liza Garcia", scenario: "Cold call: busy eatery owner", difficulty: "medium", date: "Yesterday, 4:15 PM", score: 46 },
];

export const CRITERIA: [keyof typeof demoResult.scores, string][] = [
  ["opening", "Opening & rapport"],
  ["discovery", "Needs discovery"],
  ["product", "Product knowledge accuracy"],
  ["value", "Value & benefit presentation"],
  ["objections", "Objection handling"],
  ["closing", "Closing & next step"],
  ["communication", "Professionalism & communication"],
];
