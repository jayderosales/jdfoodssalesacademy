-- Seed: settings, starter locations/departments/team, levels, the roleplay rubric and badges.
-- Learning content, products, quizzes and scenarios are seeded in Phases 2 and 3.
-- Safe to re-run.

insert into public.app_settings (id, consent_text) values (true, $consent$
**Employee Data Privacy Notice (Republic Act No. 10173 – Data Privacy Act of 2012)**

JD Foods collects only the personal data needed to run the Sales Academy: your name, work email, team, hire date, training activity (lessons, quiz answers, roleplay transcripts and scores), and field sales results entered by your manager.

**Why:** to train you, measure your progress, give you feedback, and improve our training program.

**Who can see it:** you, your sales manager, and the owner/administrators. Roleplay transcripts are processed by our AI provider (Anthropic) to generate customer replies and scores; they are not used to train AI models.

**How long:** while you work with JD Foods, and for up to 3 years after you leave, for training analytics. After that it is deleted or anonymized.

**Your rights:** you may ask to see, correct, or (where the law allows) delete your data, and you may file a complaint with the National Privacy Commission.

Contact: TODO — JD Foods Data Protection Officer (name and email).

_This notice is a placeholder for JD Foods to review with its legal adviser before launch._
$consent$)
on conflict (id) do nothing;

-- Organization (Phase 1a). Starter departments are editable placeholders; see docs/COMPANY_FACTS.md.
insert into public.locations (entity_id, code, name, type, holds_inventory, city)
select id, 'KAMUNING', 'Kamuning office', 'office', false, 'Quezon City' from public.entities where code = 'JDF'
on conflict do nothing;

insert into public.departments (entity_id, code, name)
select e.id, d.code, d.name
from public.entities e
cross join (values ('EXEC', 'Executive'), ('SALES', 'Sales'), ('OPS', 'Operations'), ('FIN', 'Finance & Accounting'),
                   ('HR', 'Human Resources'), ('MKT', 'Marketing'), ('WH', 'Warehouse & Logistics'),
                   ('MFG', 'Manufacturing'), ('QA', 'Quality Assurance')) as d(code, name)
where e.code = 'JDF'
on conflict do nothing;

insert into public.teams (name, location_id, department_id)
select 'Sales Team A', l.id, d.id
from public.locations l join public.departments d on d.code = 'SALES'
where l.code = 'KAMUNING'
on conflict (name) do nothing;

-- Levels: requirements are data so the owner can tune them (Phase 4 evaluates them).
insert into public.levels (level, name, description, requirements, requires_signoff) values
(0, 'Trainee', 'Just hired.', '{}', false),
(1, 'Product Ready', 'Knows the company and products.',
   '{"modules_completed_categories": ["company", "product"], "quiz_min_pct": 80}', false),
(2, 'Field Ready', 'Knows the scripts and objection handling; can handle easy customers.',
   '{"modules_completed_categories": ["customers", "scripts", "objections", "sop"], "roleplays": {"difficulty": "easy", "count": 3, "min_score": 70}}', false),
(3, 'Competent', 'Certified; handles medium-difficulty customers.',
   '{"certification_passed": true, "roleplays": {"difficulty": "medium", "count": 3, "avg_min": 75}}', false),
(4, 'Advanced', 'Handles hard customers; signed off by manager.',
   '{"roleplays": {"difficulty": "hard", "count": 3, "avg_min": 80}}', true),
(5, 'Expert / Coach', 'Sustained field results; can mentor others.',
   '{"kpi": {"min_attainment_pct": 90, "consecutive_months": 3}}', true)
on conflict (level) do update set name = excluded.name, description = excluded.description,
  requirements = excluded.requirements, requires_signoff = excluded.requires_signoff;

insert into public.rubrics (name, version, criteria)
select 'Standard Sales Roleplay', 1, $r$[
  {"key": "opening",       "label": "Opening and rapport",                  "weight": 1, "description": "Greets properly, introduces self and JD Foods, builds rapport, respects the customer's time."},
  {"key": "discovery",     "label": "Needs discovery",                       "weight": 1, "description": "Asks open questions about the business, volume, current supplier, pain points before pitching."},
  {"key": "product",       "label": "Product knowledge accuracy",           "weight": 1, "description": "States prices, sizes, ingredients and uses correctly; no false claims."},
  {"key": "value",         "label": "Value and benefit presentation",       "weight": 1, "description": "Links product features to this customer's needs; talks benefits, not just features."},
  {"key": "objections",    "label": "Objection handling",                   "weight": 1, "description": "Acknowledges, clarifies and answers objections calmly with evidence or options."},
  {"key": "closing",       "label": "Closing and next step",                "weight": 1, "description": "Asks for the order or a clear next step (trial, sampling visit, follow-up date)."},
  {"key": "communication", "label": "Professionalism and communication",    "weight": 1, "description": "Polite, clear, uses 'po' appropriately, listens, no pressure tactics."}
]$r$::jsonb
where not exists (select 1 from public.rubrics where name = 'Standard Sales Roleplay' and version = 1);

insert into public.badges (code, name, description, icon) values
('level_1', 'Product Ready', 'Reached Level 1', 'package'),
('level_2', 'Field Ready', 'Reached Level 2', 'map'),
('level_3', 'Competent', 'Reached Level 3', 'badge-check'),
('level_4', 'Advanced', 'Reached Level 4', 'trophy'),
('level_5', 'Expert / Coach', 'Reached Level 5', 'crown'),
('first_roleplay', 'First Pitch', 'Completed a first AI roleplay', 'message-circle'),
('streak_7', '7-Day Streak', 'Practiced 7 days in a row', 'flame')
on conflict (code) do nothing;
