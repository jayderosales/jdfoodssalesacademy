# JD Foods Sales Academy

Training, assessment and performance tracking for the JD Foods sales team. Built with Next.js (App Router), TypeScript, Tailwind, Supabase and the Anthropic API.

**Status:** Phases 1–3 complete. Not yet deployed.

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth, roles, teams, full DB schema + RLS, user management, layout | ✅ |
| 2 | Content editor, learning paths, lesson player, quiz engine, seed content | ✅ |
| 3 | AI roleplay: scenarios, chat, AI customer, AI grader, manager review | ✅ |
| 4 | Skill score, levels, KPIs, dashboards, at-risk flags, exports | ⏳ |
| 5 | AI quiz generator, email notifications, pre-hire assessment, E2E tests, deployment guide | ⏳ |

---

## 1. Prerequisites

- Node.js 20+ (tested on 24)
- A Supabase project (free tier is fine to start): https://supabase.com
- An Anthropic API key (used from Phase 2 for grading short-answer quiz questions; without it, those answers go to the manager for review)
- Later: a Vercel account for hosting

## 2. Supabase setup

1. Create a project. Region: **Southeast Asia (Singapore)** is closest to the Philippines.
2. **Authentication → Sign In / Providers → Email:** keep Email enabled and **turn off "Allow new users to sign up"**. Accounts are created by the owner only.
3. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:3000` (later, your Vercel URL)
   - Redirect URLs: `http://localhost:3000/auth/callback` (later, also `https://YOUR-DOMAIN/auth/callback`)
4. Apply the database migrations and seed. Pick one option:
   - **Supabase CLI (recommended):**
     ```bash
     npx supabase login
     npx supabase link --project-ref YOUR_PROJECT_REF
     npx supabase db push --include-seed
     ```
   - **SQL editor:** paste and run, in order, every file in `supabase/migrations/`, then `supabase/seed.sql`, `seed_content_1_lessons.sql`, `seed_content_2_products.sql`, `seed_content_3_quizzes.sql`, `seed_content_4_scenarios.sql`.

   The content seeds create the **New Hire Onboarding** path (6 modules, 37 lessons), 16 **placeholder** products (all marked unverified) and 7 quizzes with 50 questions. Company-specific facts we don't know yet are marked **TODO** inside lessons and products. Fill them in under *Content* before launch.

## 3. Local setup

```bash
npm install
cp .env.example .env.local     # then fill in the Supabase values (Project Settings → API)
npm run create-owner -- you@jdfoods.ph "Your Name"   # prints a temporary password once
npm run dev                     # http://localhost:3000
```

## 4. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests + database tests (runs the real migrations in an in-memory Postgres and checks every access rule; no Docker needed) |
| `npm run create-owner -- <email> "<name>"` | Creates the first Owner/Admin (password from `OWNER_PASSWORD` or generated) |

## 5. How access control works

- **Roles:** `owner` (everything), `manager` (reps on the teams they manage), `rep` (own data).
- **Enforced in Postgres with Row Level Security** (`supabase/migrations/…_rls.sql`), not just the UI. Highlights:
  - A trigger blocks non-owners from changing role, team, status or exit details. Reps can't change their own hire date. Only the employee can give their own privacy consent.
  - The last active owner can't be demoted or deactivated.
  - Deactivated users are blocked from signing in and can read nothing, but their data is kept for analytics.
  - Quiz answer keys and full roleplay personas (hidden needs) are staff-only; reps get them stripped by the server.
  - KPIs can be entered only by the rep's manager or the owner, never by the rep.
- **Service-role key** (bypasses RLS) is used server-side only: creating accounts, and in later phases writing grading results. Never exposed to the browser.
- **Audit log:** database triggers record every change to users, teams, settings and content, with who made it.

## 6. Project layout

```
src/
  app/
    login/, auth/, consent/       sign-in, magic link / invite callback, privacy notice
    (app)/                        signed-in area (sidebar on desktop, bottom bar on phones)
      dashboard/ account/ team/
      admin/users|teams|settings|audit|content
      learn/ quizzes/ roleplay/ reviews/ reports/   (placeholders for Phases 2–4)
  components/ui                   shadcn-style primitives
  lib/                            auth helpers, Supabase clients, nav, utils
supabase/
  migrations/                     schema, RLS, audit triggers
  seed.sql                        settings, starter branch/team, levels, rubric, badges
  tests/rls.test.ts               access-rule tests
scripts/create-owner.mjs
```

## 7. Placeholder data to verify before launch

- **Privacy notice** (Settings → Data privacy): placeholder text. Have it reviewed against the Data Privacy Act and fill in the DPO contact.
- **Brand colours and logo** (Settings → Branding).
- **Products** (Content → Products): every product is a placeholder. Verify sizes, prices, ingredients and allergens, then tick *Verified*.
- **TODO markers in lessons:** mission statement, sourcing details, documents, distributor/affiliate terms, minimum orders, payment terms, discount limits, delivery schedule, returns policy, reporting tool, quotas. Search lessons for "TODO".

## 8. How learning and quizzes work (Phase 2)

- **Learning paths → modules → lessons.** The default path applies to every rep; managers can assign more paths with due dates (My team → rep).
- **Unlocking:** modules and lessons unlock in order when *Unlock in order* is on. A module quiz opens when its lessons are done; the certification exam opens when the whole path is done. Rules live in `src/lib/learning/unlock.ts` (unit-tested).
- **Progress** (opened, completed, time on lesson) is written by the server only, after checking the unlock rules, so reps can't mark locked lessons complete through the API.
- **Quizzes** draw `questions per attempt` at random from the *approved* question bank, shuffle answer order, and avoid the previous attempt's questions when the bank is big enough. Attempt limits and cooldowns are per quiz. Answer keys never reach the browser.
- **Short-answer and scenario questions** are graded by Claude against the admin's model answer (`src/lib/ai/prompts/quiz-grade.ts`, versioned). If the AI is unavailable, the answer is flagged and the manager grades it from the attempt page. Token usage and cost go to `ai_usage`.
- **Rich text (lessons):** lessons are edited in a Tiptap editor; the JSON is sanitized (safe links, https images, YouTube/Vimeo only) and rendered to HTML on the server.

## 9. How AI roleplay works (Phase 3)

- **Scenarios** (Content → Roleplay scenarios): a briefing and goal the rep sees, plus a hidden customer persona (personality, budget, current supplier, hidden needs, objections), products, difficulty, language (Taglish/English), max turns and rubric. Eight starters are seeded.
- **The AI customer** (`src/lib/ai/prompts/customer.ts`, version `customer.v1`) stays in character, never coaches, raises objections one at a time, only agrees when the rep earns it, and ends the conversation with a hidden marker (agreed / declined / left). It receives the scenario's product facts. Fields still marked TODO are left out, so it never treats placeholder data as fact and will question wrong claims.
- **Chat**: replies stream in as they are generated (`/api/roleplay/[id]/turn`). The system prompt is cached between turns to keep cost and latency down. A rep can't double-send, and a failed turn is rolled back so they can resend.
- **Grading** (`src/lib/ai/prompts/grader.ts`, version `grader.v1`): a separate Claude call returns structured JSON (7 scores of 1–5, goal achieved, 3 strengths, 3 improvements with better example lines, factual errors, summary). The output is validated with Zod. The **overall score is computed in code**: weighted average of the 7 scores × 20 (so 4/5 = 80). See `src/lib/roleplay/scoring.ts` (unit-tested).
- **Manager review** (Reviews): queue of scored roleplays not yet reviewed, plus quiz answers the AI couldn't grade. Managers can comment, mark reviewed, or **adjust the score**. An adjustment adds a new score row; the original AI score is kept and shown in the score history with its prompt version and model.
- **Cost controls**: daily roleplay limit per rep (Settings, Manila calendar day; owner exempt), optional monthly AI budget that blocks new roleplays, a max-turns cap per scenario, and every AI call logged to `ai_usage` with estimated USD cost.
- **Models**: `AI_MODEL_CUSTOMER` and `AI_MODEL_GRADER` (default `claude-opus-5-5`). The customer runs at low effort for fast replies; the grader at medium. Both use server-side refusal fallbacks.
