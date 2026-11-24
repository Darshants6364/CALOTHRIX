-- ============================================================================
-- CALOTHRIX: 15-Day Adaptive Nutrition Cycles & Target History Versioning
-- Additive, Backward-Compatible & Idempotent PostgreSQL / Supabase Migration
-- ============================================================================

-- 1. Extend public.profiles with adaptive pause, manual override, and onboarding flags
alter table public.profiles
  add column if not exists adaptive_paused boolean not null default false,
  add column if not exists manual_override_active boolean not null default false,
  add column if not exists cycle_anchor_date text,
  add column if not exists onboarding_completed boolean not null default false;

-- 2. Extend public.nutrition_goals with manual override tracking
alter table public.nutrition_goals
  add column if not exists manual_override_active boolean not null default false;

-- 3. Extend public.weekly_assessments for 15-day cycle analytics & structured AI output
alter table public.weekly_assessments
  add column if not exists cycle_days integer not null default 15,
  add column if not exists assessment_status_tag text,
  add column if not exists structured_ai_output jsonb,
  add column if not exists avg_daily_carbs numeric not null default 0,
  add column if not exists avg_daily_fat numeric not null default 0,
  add column if not exists avg_daily_fibre numeric not null default 0;

-- 4. Create public.nutrition_target_history for versioned target changes
create table if not exists public.nutrition_target_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_calories integer,
  previous_protein numeric,
  previous_carbs numeric,
  previous_fat numeric,
  previous_fibre numeric,
  new_calories integer not null,
  new_protein numeric not null,
  new_carbs numeric not null,
  new_fat numeric not null,
  new_fibre numeric not null,
  target_weight_kg numeric,
  effective_date text not null,
  adjustment_reason text not null default '',
  assessment_id uuid,
  applied boolean not null default true,
  adjustment_type text not null default 'initial' check (adjustment_type in ('initial', 'manual', 'adaptive')),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_target_history_user_created_idx
  on public.nutrition_target_history (user_id, created_at desc);

alter table public.nutrition_target_history enable row level security;

drop policy if exists "Users manage own nutrition target history" on public.nutrition_target_history;
create policy "Users manage own nutrition target history" on public.nutrition_target_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authorized trainers read client nutrition target history" on public.nutrition_target_history;
create policy "Authorized trainers read client nutrition target history" on public.nutrition_target_history
  for select
  using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = nutrition_target_history.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_goals = true
    )
  );

grant select, insert, update, delete on public.nutrition_target_history to authenticated;

-- 5. Refresh PostgREST schema cache
notify pgrst, 'reload schema';
