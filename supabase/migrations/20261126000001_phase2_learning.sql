-- Phase 2: learning + quizzes adjustments.

-- Certification exams belong to a learning path and draw from that path's module quizzes.
alter table public.quizzes add column path_id uuid references public.learning_paths(id) on delete set null;

-- Short answers the AI could not grade are flagged for a manager instead of silently marked wrong.
alter table public.quiz_answers add column needs_review boolean not null default false;
alter table public.quiz_attempts add column needs_review boolean not null default false;

create index on public.quizzes (module_id);
create index on public.quizzes (path_id);
create index on public.lesson_assets (lesson_id);

-- Images placed inside lesson text need stable URLs, so they live in a public bucket.
-- (Training content is not sensitive. PDFs/files attached to lessons stay in the private `content` bucket.)
insert into storage.buckets (id, name, public) values ('lesson-media', 'lesson-media', true) on conflict do nothing;
create policy "lesson-media: owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'lesson-media' and public.is_owner());
create policy "lesson-media: owner delete" on storage.objects for delete to authenticated using (bucket_id = 'lesson-media' and public.is_owner());

-- Progress affects levels, so reps must not write it directly through the API (they could mark
-- locked lessons complete). The server records progress after checking the unlock rules.
drop policy "progress: own insert" on public.lesson_progress;
drop policy "progress: own update" on public.lesson_progress;
