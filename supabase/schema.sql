-- CALOTHRIX (MacroLog) Upgraded Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- Idempotent migration script: safe to run on existing databases without data loss.
-- Run in: https://supabase.com/dashboard/project/zzncijlmoskbilxjgiua/sql/new

-- Enable pgvector for semantic food embeddings
create extension if not exists vector;

-- 1. Core User Profiles (extended with fitness calculator & dietary fields + role)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  avatar_url text,
  age integer not null default 0,
  biological_sex text not null default 'male',
  height_cm numeric not null default 0,
  current_weight_kg numeric not null default 0,
  target_weight_kg numeric not null default 0,
  daily_average_steps integer not null default 7000,
  activity_level text not null default 'moderate',
  workout_frequency integer not null default 3,
  workout_intensity text not null default 'moderate',
  fitness_goal text not null default 'maintenance',
  dietary_preference text not null default 'omnivore',
  food_restrictions text[] not null default '{}',
  account_role text not null default 'individual',
  theme text not null default 'dark',
  weight_unit text not null default 'kg',
  food_unit text not null default 'g',
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists biological_sex text not null default 'male';
alter table public.profiles add column if not exists daily_average_steps integer not null default 7000;
alter table public.profiles add column if not exists workout_frequency integer not null default 3;
alter table public.profiles add column if not exists workout_intensity text not null default 'moderate';
alter table public.profiles add column if not exists dietary_preference text not null default 'omnivore';
alter table public.profiles add column if not exists food_restrictions text[] not null default '{}';
alter table public.profiles add column if not exists account_role text not null default 'individual';

-- 2. Nutrition Goals (extended with estimated BMR / TDEE metadata)
create table if not exists public.nutrition_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preset text not null default 'custom',
  calories integer not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  fibre numeric not null default 0,
  target_weight_kg numeric,
  estimated_bmr integer,
  estimated_tdee integer,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_goals add column if not exists estimated_bmr integer;
alter table public.nutrition_goals add column if not exists estimated_tdee integer;

-- 3. Weight Goals
create table if not exists public.weight_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_weight_kg numeric not null default 0,
  target_weight_kg numeric not null default 0,
  goal_direction text not null default 'maintain',
  updated_at timestamptz not null default now()
);

-- 4. Personal Custom Foods (private to creator; never overwrites verified catalog)
create table if not exists public.custom_foods (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  category text not null default 'Custom',
  serving_name text not null,
  serving_weight_grams numeric not null,
  calories numeric not null,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  fibre numeric not null default 0,
  other_nutrients jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.custom_foods add column if not exists brand text;
alter table public.custom_foods add column if not exists other_nutrients jsonb not null default '{}'::jsonb;
create index if not exists custom_foods_user_idx on public.custom_foods(user_id);

-- 5. Daily Food Logs (extended with provenance)
create table if not exists public.food_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  meal_type text not null,
  food_id text not null,
  food_name text not null,
  quantity_grams numeric not null,
  servings_count numeric not null,
  serving_name text not null,
  calories numeric not null,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  fibre numeric not null default 0,
  source_name text,
  source_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.food_entries add column if not exists source_name text;
alter table public.food_entries add column if not exists source_type text;
create index if not exists food_entries_user_date_idx on public.food_entries(user_id, date);

-- 6. Weight Entries
create table if not exists public.weight_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric not null,
  date text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weight_entries_user_date_idx on public.weight_entries(user_id, date);

-- 7. Food Preferences (favorites & recents)
create table if not exists public.user_food_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorite_food_ids text[] not null default '{}',
  recent_food_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 8. Global Food Database & Provenance Catalog (read-only to clients; backend/admin managed)
create table if not exists public.global_foods (
  id text primary key,
  name text not null,
  brand text,
  country text,
  barcode text,
  category text not null,
  ingredients_text text,
  serving_name text not null,
  serving_weight_grams numeric not null default 100,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  fibre numeric,
  micronutrients jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  source_type text not null check (source_type in ('verified_reference', 'branded', 'community')),
  source_name text not null,
  source_id text,
  source_url text,
  license text not null,
  data_quality text not null default 'moderate',
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(ingredients_text, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists global_foods_search_idx on public.global_foods using gin(search_vector);
create index if not exists global_foods_barcode_idx on public.global_foods(barcode) where barcode is not null;
create index if not exists global_foods_category_idx on public.global_foods(category);
create index if not exists global_foods_source_idx on public.global_foods(source_type, source_name);

-- 9. Cached Food Embeddings (pgvector 384-dim for Supabase gte-small)
create table if not exists public.food_embeddings (
  food_id text primary key references public.global_foods(id) on delete cascade,
  content_hash text not null,
  embedding vector(384) not null,
  model_name text not null default 'gte-small',
  updated_at timestamptz not null default now()
);

create index if not exists food_embeddings_hnsw_idx
  on public.food_embeddings using hnsw (embedding vector_cosine_ops);

-- Semantic search RPC for Supabase Edge Functions
create or replace function public.match_global_foods(
  query_embedding vector(384),
  match_threshold float default 0.45,
  match_count int default 20
)
returns table (
  id text,
  name text,
  brand text,
  country text,
  barcode text,
  category text,
  ingredients_text text,
  serving_name text,
  serving_weight_grams numeric,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  fibre numeric,
  micronutrients jsonb,
  missing_fields text[],
  dietary_tags text[],
  source_type text,
  source_name text,
  source_id text,
  source_url text,
  license text,
  data_quality text,
  similarity float
)
language sql stable
as $$
  select
    gf.id,
    gf.name,
    gf.brand,
    gf.country,
    gf.barcode,
    gf.category,
    gf.ingredients_text,
    gf.serving_name,
    gf.serving_weight_grams,
    gf.calories,
    gf.protein,
    gf.carbs,
    gf.fat,
    gf.fibre,
    gf.micronutrients,
    gf.missing_fields,
    gf.dietary_tags,
    gf.source_type,
    gf.source_name,
    gf.source_id,
    gf.source_url,
    gf.license,
    gf.data_quality,
    1 - (fe.embedding <=> query_embedding) as similarity
  from public.food_embeddings fe
  join public.global_foods gf on gf.id = fe.food_id
  where 1 - (fe.embedding <=> query_embedding) > match_threshold
  order by fe.embedding <=> query_embedding
  limit match_count;
$$;

-- 10. AI Usage Logs & Weekly Analytics
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  query_hash text,
  provider text not null,
  tokens_or_units integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_date_idx on public.ai_usage_logs(user_id, created_at desc);

create table if not exists public.weekly_analytics (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start text not null,
  avg_calories integer not null default 0,
  avg_protein numeric not null default 0,
  avg_carbs numeric not null default 0,
  avg_fat numeric not null default 0,
  avg_fibre numeric not null default 0,
  avg_weight_kg numeric,
  goal_completion_pct integer not null default 0,
  summary_text text,
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

-- 11. Future-Ready Trainer Architecture (Portal disabled until separate launch)
create table if not exists public.trainer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  specialties text[] not null default '{}',
  certifications text[] not null default '{}',
  accepting_clients boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  can_view_nutrition boolean not null default false,
  can_view_weight boolean not null default false,
  can_view_goals boolean not null default false,
  can_add_notes boolean not null default false,
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  unique(trainer_id, client_id)
);

create table if not exists public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_client_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  week_start_date text not null,
  avg_calories integer not null default 0,
  avg_protein numeric not null default 0,
  avg_weight_kg numeric,
  client_notes text,
  trainer_feedback text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  created_at timestamptz not null default now()
);

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.weight_goals enable row level security;
alter table public.custom_foods enable row level security;
alter table public.food_entries enable row level security;
alter table public.weight_entries enable row level security;
alter table public.user_food_preferences enable row level security;
alter table public.global_foods enable row level security;
alter table public.food_embeddings enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.weekly_analytics enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.trainer_clients enable row level security;
alter table public.client_invitations enable row level security;
alter table public.trainer_notes enable row level security;
alter table public.weekly_client_checkins enable row level security;

-- Individual User Isolation Policies (auth.uid() = user_id)
drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own nutrition goals" on public.nutrition_goals;
create policy "Users manage own nutrition goals" on public.nutrition_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own weight goals" on public.weight_goals;
create policy "Users manage own weight goals" on public.weight_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own custom foods" on public.custom_foods;
create policy "Users manage own custom foods" on public.custom_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own food entries" on public.food_entries;
create policy "Users manage own food entries" on public.food_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own weight entries" on public.weight_entries;
create policy "Users manage own weight entries" on public.weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own food preferences" on public.user_food_preferences;
create policy "Users manage own food preferences" on public.user_food_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read global foods" on public.global_foods;
create policy "Users read global foods" on public.global_foods
  for select using (true);

drop policy if exists "Users read cached embeddings" on public.food_embeddings;
create policy "Users read cached embeddings" on public.food_embeddings
  for select using (auth.role() = 'authenticated');

drop policy if exists "Users manage own ai logs" on public.ai_usage_logs;
create policy "Users manage own ai logs" on public.ai_usage_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own weekly analytics" on public.weekly_analytics;
create policy "Users manage own weekly analytics" on public.weekly_analytics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Strict Trainer Privacy Policies (Zero access without explicit active client authorization)
drop policy if exists "Trainers manage own trainer profile" on public.trainer_profiles;
create policy "Trainers manage own trainer profile" on public.trainer_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Clients control trainer permissions" on public.trainer_clients;
create policy "Clients control trainer permissions" on public.trainer_clients
  for all using (auth.uid() = client_id or auth.uid() = trainer_id)
  with check (auth.uid() = client_id);

drop policy if exists "Trainers manage own invitations" on public.client_invitations;
create policy "Trainers manage own invitations" on public.client_invitations
  for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "Authorized trainers read food entries" on public.food_entries;
create policy "Authorized trainers read food entries" on public.food_entries
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = food_entries.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.can_view_nutrition = true
    )
  );

drop policy if exists "Authorized trainers read weight entries" on public.weight_entries;
create policy "Authorized trainers read weight entries" on public.weight_entries
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = weight_entries.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.can_view_weight = true
    )
  );

drop policy if exists "Authorized trainers manage notes" on public.trainer_notes;
create policy "Authorized trainers manage notes" on public.trainer_notes
  for all using (
    auth.uid() = client_id or (
      auth.uid() = trainer_id and exists (
        select 1 from public.trainer_clients tc
        where tc.client_id = trainer_notes.client_id
          and tc.trainer_id = auth.uid()
          and tc.status = 'active'
          and tc.can_add_notes = true
      )
    )
  )
  with check (
    auth.uid() = trainer_id and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = trainer_notes.client_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.can_add_notes = true
    )
  );

drop policy if exists "Authorized checkins access" on public.weekly_client_checkins;
create policy "Authorized checkins access" on public.weekly_client_checkins
  for all using (
    auth.uid() = client_id or (
      auth.uid() = trainer_id and exists (
        select 1 from public.trainer_clients tc
        where tc.client_id = weekly_client_checkins.client_id
          and tc.trainer_id = auth.uid()
          and tc.status = 'active'
      )
    )
  )
  with check (auth.uid() = client_id);

grant usage on schema public to anon, authenticated;
grant select on public.global_foods to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.nutrition_goals, public.weight_goals,
  public.custom_foods, public.food_entries, public.weight_entries, public.user_food_preferences,
  public.ai_usage_logs, public.weekly_analytics, public.trainer_profiles, public.trainer_clients,
  public.client_invitations, public.trainer_notes, public.weekly_client_checkins to authenticated;
