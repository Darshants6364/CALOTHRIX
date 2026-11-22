-- ============================================================================
-- CALOTHRIX: Smart Calorie Tracker & 7-Day AI Adaptive Assessments Migration
-- Additive, Backward-Compatible & Idempotent PostgreSQL / Supabase Migration
-- ============================================================================
-- Preserves all existing tables, rows, columns, profiles, nutrition_goals,
-- trainer_clients policies, food tracking, and custom foods.
-- ============================================================================

-- 1. Extend public.profiles with Smart Calorie Tracker & Adaptive TDEE metadata
alter table public.profiles
  add column if not exists macro_focus text not null default 'balanced',
  add column if not exists adaptive_tdee_kcal integer,
  add column if not exists last_weekly_assessment_at timestamptz,
  add column if not exists body_fat_pct numeric,
  add column if not exists is_pregnant_or_breastfeeding boolean not null default false;

-- 2. Extend public.nutrition_goals with adaptive & versioned calculation metadata
alter table public.nutrition_goals
  add column if not exists macro_focus text not null default 'balanced',
  add column if not exists adaptive_tdee_kcal integer,
  add column if not exists assessment_week_number integer not null default 0,
  add column if not exists initial_calculated_at timestamptz,
  add column if not exists calculation_version text not null default 'calothrix-smart-v2.0';

-- 3. Create public.weekly_assessments table for 7-Day AI Adaptive Assessments
create table if not exists public.weekly_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date text not null,
  week_end_date text not null,
  previous_weight_kg numeric not null,
  assessed_weight_kg numeric not null,
  previous_trend_weight_kg numeric not null,
  assessed_trend_weight_kg numeric not null,
  avg_daily_calories integer not null default 0,
  avg_daily_protein numeric not null default 0,
  prior_tdee_kcal integer not null default 0,
  calibrated_tdee_kcal integer not null default 0,
  previous_recommended_calories integer not null default 0,
  recommended_calories integer not null default 0,
  recommended_protein numeric not null default 0,
  recommended_carbs numeric not null default 0,
  recommended_fat numeric not null default 0,
  recommended_fibre numeric not null default 0,
  food_logged_days integer not null default 0,
  weight_logged_days integer not null default 0,
  adherence_percentage numeric not null default 0,
  confidence_level text not null default 'low' check (confidence_level in ('high', 'moderate', 'low')),
  adjustment_reason text not null default '',
  ai_summary jsonb not null default '{}'::jsonb,
  rationale_bullets jsonb not null default '[]'::jsonb,
  calculation_version text not null default 'calothrix-smart-v2.0',
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date, week_end_date)
);

-- Additive columns safeguard in case table already existed from a partial run
alter table public.weekly_assessments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists assessment_week_number integer not null default 1,
  add column if not exists recommended_hydration_ml integer,
  add column if not exists goal_completed boolean not null default false,
  add column if not exists suggested_maintenance_calories integer,
  add column if not exists adjustment_type text not null default 'maintained',
  add column if not exists applied_at timestamptz;

create index if not exists weekly_assessments_user_created_idx
  on public.weekly_assessments (user_id, created_at desc);

create index if not exists weekly_assessments_user_period_idx
  on public.weekly_assessments (user_id, week_start_date, week_end_date);

create index if not exists weekly_assessments_user_status_idx
  on public.weekly_assessments (user_id, status);

-- 4. Row-Level Security (Strict per-user isolation + authorized active trainer read access)
alter table public.weekly_assessments enable row level security;

drop policy if exists "Users manage own weekly assessments" on public.weekly_assessments;
create policy "Users manage own weekly assessments" on public.weekly_assessments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authorized trainers read client weekly assessments" on public.weekly_assessments;
create policy "Authorized trainers read client weekly assessments" on public.weekly_assessments
  for select
  using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = weekly_assessments.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_nutrition = true
    )
  );

grant select, insert, update, delete on public.weekly_assessments to authenticated;

-- 5. Refresh PostgREST schema cache
notify pgrst, 'reload schema';
