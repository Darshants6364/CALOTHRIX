-- CALOTHRIX — Security, RLS Privilege Hardening & Cross-Device Sync Migration
-- Run in Supabase SQL Editor to apply production security and cross-device sync tables.

-- ============================================================================
-- 1. PREVENT CLIENT-SIDE ADMIN ROLE ESCALATION ON public.profiles
-- ============================================================================
-- Authenticated users may switch between 'individual' and 'trainer',
-- but MUST NEVER be allowed to set account_role = 'admin' from the client.

create or replace function public.prevent_client_admin_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  is_server_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
begin
  -- Allow service_role or server-verified admin JWTs
  if jwt_role = 'service_role' or is_server_admin then
    return new;
  end if;

  -- Restrict client-submitted account_role strictly to 'individual' or 'trainer'
  if new.account_role is null or new.account_role not in ('individual', 'trainer') then
    if tg_op = 'UPDATE' and old.account_role in ('individual', 'trainer') then
      new.account_role := old.account_role;
    else
      new.account_role := 'individual';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_client_admin_role_escalation on public.profiles;
create trigger trg_prevent_client_admin_role_escalation
before insert or update on public.profiles
for each row execute function public.prevent_client_admin_role_escalation();

-- ============================================================================
-- 2. HARDEN public.is_calothrix_admin()
-- ============================================================================
-- Trust ONLY server-assigned Supabase auth.users.raw_app_meta_data (JWT app_metadata),
-- never user-editable profiles.account_role or hardcoded personal emails.

create or replace function public.is_calothrix_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

-- ============================================================================
-- 3. CROSS-DEVICE SYNC TABLES: SAVED MEAL COMBOS & DAILY WATER LOGS
-- ============================================================================

create table if not exists public.user_saved_meals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  meal_type text not null default 'lunch',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_saved_meals_user_id on public.user_saved_meals(user_id);

alter table public.user_saved_meals enable row level security;

drop policy if exists "Users manage own saved meals" on public.user_saved_meals;
create policy "Users manage own saved meals" on public.user_saved_meals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.water_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  amount_ml integer not null default 0 check (amount_ml >= 0 and amount_ml <= 20000),
  daily_goal_ml integer not null default 2500 check (daily_goal_ml >= 500 and daily_goal_ml <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

create index if not exists idx_water_logs_user_date on public.water_logs(user_id, log_date desc);

alter table public.water_logs enable row level security;

drop policy if exists "Users manage own water logs" on public.water_logs;
create policy "Users manage own water logs" on public.water_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 4. ENSURE AI TRAINING EVENTS CANNOT BE INSERTED ANONYMOUSLY
-- ============================================================================
drop policy if exists "Insert own ai training events" on public.ai_training_events;
create policy "Insert own ai training events" on public.ai_training_events
  for insert to authenticated
  with check (auth.uid() = user_id);
