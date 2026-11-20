-- Calothrix AI Self-Improving Reinforcement Training & Insights Schema
-- Stores exact AI descriptions + raw outputs vs user-edited outputs, computes reinforcement rewards/penalties,
-- and maintains a verified shared knowledge dataset (ai_learned_priors) + daily calibration runs.

-- 1. Raw vs. User-Edited AI Training Events
create table if not exists public.ai_training_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  input_mode text not null check (input_mode in ('photo', 'voice', 'text', 'quick_parse', 'label_ocr')),
  prep_style text not null default 'standard',
  user_input_text text,
  image_storage_path text,
  ai_description text not null,
  ai_raw_output jsonb not null default '{}'::jsonb,
  user_final_output jsonb not null default '{}'::jsonb,
  user_changed boolean not null default false,
  edit_diff_summary jsonb not null default '{}'::jsonb,
  reward_score numeric not null default 1.0,
  user_feedback_note text,
  verified_for_training boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_training_events_created_idx on public.ai_training_events(created_at desc);
create index if not exists ai_training_events_mode_idx on public.ai_training_events(input_mode, created_at desc);
create index if not exists ai_training_events_changed_idx on public.ai_training_events(user_changed, verified_for_training);
create index if not exists ai_training_events_reward_idx on public.ai_training_events(reward_score asc);

-- 2. Verified Shared Knowledge Dataset Derived from User Feedback
create table if not exists public.ai_learned_priors (
  id uuid primary key default gen_random_uuid(),
  food_key text not null unique,
  display_name text not null,
  input_mode text not null default 'all',
  canonical_description text not null,
  avg_serving_grams numeric not null default 100,
  avg_calories numeric not null default 0,
  avg_protein numeric not null default 0,
  avg_carbs numeric not null default 0,
  avg_fat numeric not null default 0,
  avg_fibre numeric not null default 0,
  correction_pattern text,
  sample_count integer not null default 1,
  avg_reward_score numeric not null default 0,
  confidence_weight numeric not null default 0.5,
  is_verified_shared boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_learned_priors_shared_idx on public.ai_learned_priors(is_verified_shared, sample_count desc);

-- 3. Daily & Manual Reinforcement Training Runs Log
create table if not exists public.ai_training_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'reinforcement_calibration' check (run_type in ('auto_daily', 'auto_feedback', 'manual_admin', 'reinforcement_calibration')),
  events_processed integer not null default 0,
  verified_events_count integer not null default 0,
  edited_events_count integer not null default 0,
  priors_updated_count integer not null default 0,
  mean_reward_score numeric not null default 0,
  mean_calorie_mae numeric not null default 0,
  acceptance_rate_pct numeric not null default 100,
  notes text,
  triggered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_training_runs_created_idx on public.ai_training_runs(created_at desc);

-- 4. Row-Level Security
alter table public.ai_training_events enable row level security;
alter table public.ai_learned_priors enable row level security;
alter table public.ai_training_runs enable row level security;

drop policy if exists "Insert own ai training events" on public.ai_training_events;
create policy "Insert own ai training events" on public.ai_training_events
  for insert to authenticated, anon
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "Read own or admin ai training events" on public.ai_training_events;
create policy "Read own or admin ai training events" on public.ai_training_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_calothrix_admin());

drop policy if exists "Admins manage ai training events" on public.ai_training_events;
create policy "Admins manage ai training events" on public.ai_training_events
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Read verified shared ai learned priors" on public.ai_learned_priors;
create policy "Read verified shared ai learned priors" on public.ai_learned_priors
  for select to anon, authenticated
  using (is_verified_shared = true or public.is_calothrix_admin());

drop policy if exists "Admins manage ai learned priors" on public.ai_learned_priors;
create policy "Admins manage ai learned priors" on public.ai_learned_priors
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins read manage ai training runs" on public.ai_training_runs;
create policy "Admins read manage ai training runs" on public.ai_training_runs
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

grant insert on public.ai_training_events to anon, authenticated;
grant select, update, delete on public.ai_training_events to authenticated;
grant select on public.ai_learned_priors to anon, authenticated;
grant insert, update, delete on public.ai_learned_priors to authenticated;
grant select, insert, update, delete on public.ai_training_runs to authenticated;

notify pgrst, 'reload schema';
