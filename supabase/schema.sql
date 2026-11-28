-- CALOTHRIX (MacroLog) Complete Production Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- Idempotent migration script: safe to run on existing databases without data loss.
-- Run in: https://supabase.com/dashboard/project/zzncijlmoskbilxjgiua/sql/new

-- Enable pgcrypto & pgvector
create extension if not exists pgcrypto;
create extension if not exists vector;

-- 1. Core User Profiles (extended with fitness calculator, goal speed, dietary preferences & role selection)
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
  goal_speed text not null default 'moderate',
  dietary_preference text not null default 'omnivore',
  food_restrictions text[] not null default '{}',
  account_role text not null default 'individual',
  role_selected boolean not null default false,
  theme text not null default 'dark',
  weight_unit text not null default 'kg',
  food_unit text not null default 'g',
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists biological_sex text not null default 'male';
alter table public.profiles add column if not exists daily_average_steps integer not null default 7000;
alter table public.profiles add column if not exists workout_frequency integer not null default 3;
alter table public.profiles add column if not exists workout_intensity text not null default 'moderate';
alter table public.profiles add column if not exists goal_speed text not null default 'moderate';
alter table public.profiles add column if not exists dietary_preference text not null default 'omnivore';
alter table public.profiles add column if not exists food_restrictions text[] not null default '{}';
alter table public.profiles add column if not exists account_role text not null default 'individual';
alter table public.profiles add column if not exists role_selected boolean not null default false;

-- 2. Nutrition Goals (extended with BMI, estimated BMR/TDEE, goal speed & timeline)
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
  bmi numeric,
  goal_speed text,
  estimated_weeks integer,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_goals add column if not exists estimated_bmr integer;
alter table public.nutrition_goals add column if not exists estimated_tdee integer;
alter table public.nutrition_goals add column if not exists bmi numeric;
alter table public.nutrition_goals add column if not exists goal_speed text;
alter table public.nutrition_goals add column if not exists estimated_weeks integer;

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

-- 11. Fitness Trainer Architecture, Client Consent, Invitations & Target Recommendations
create table if not exists public.trainer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  specialties text[] not null default '{}',
  certifications text[] not null default '{}',
  accepting_clients boolean not null default true,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro', 'premium')),
  max_clients integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trainer_profiles add column if not exists subscription_tier text not null default 'free';
alter table public.trainer_profiles add column if not exists max_clients integer not null default 5;

create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  can_view_profile boolean not null default true,
  can_view_nutrition boolean not null default true,
  can_view_weight boolean not null default true,
  can_view_goals boolean not null default true,
  can_add_notes boolean not null default true,
  can_manage_goals boolean not null default true,
  is_archived boolean not null default false,
  authorized_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(trainer_id, client_id)
);

alter table public.trainer_clients add column if not exists can_view_profile boolean not null default true;
alter table public.trainer_clients add column if not exists can_manage_goals boolean not null default true;
alter table public.trainer_clients add column if not exists is_archived boolean not null default false;
alter table public.trainer_clients add column if not exists updated_at timestamptz not null default now();
create index if not exists trainer_clients_trainer_idx on public.trainer_clients(trainer_id, status);
create index if not exists trainer_clients_client_idx on public.trainer_clients(client_id, status);

create table if not exists public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null default '',
  client_name text,
  invite_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

alter table public.client_invitations add column if not exists client_name text;
alter table public.client_invitations add column if not exists invite_token text;
alter table public.client_invitations add column if not exists message text;
update public.client_invitations
  set invite_token = encode(gen_random_bytes(16), 'hex')
  where invite_token is null;
alter table public.client_invitations alter column invite_token set default encode(gen_random_bytes(16), 'hex');
create unique index if not exists client_invitations_token_idx on public.client_invitations(invite_token);
create index if not exists client_invitations_email_idx on public.client_invitations(lower(client_email));

create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists trainer_notes_lookup_idx on public.trainer_notes(trainer_id, client_id, created_at desc);

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

create index if not exists weekly_checkins_lookup_idx on public.weekly_client_checkins(trainer_id, client_id, created_at desc);

create table if not exists public.target_recommendations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  recommended_calories integer not null,
  recommended_protein numeric not null,
  recommended_carbs numeric not null,
  recommended_fat numeric not null,
  recommended_fibre numeric not null default 28,
  recommended_target_weight_kg numeric,
  rationale text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists target_recommendations_client_idx on public.target_recommendations(client_id, status, created_at desc);
create index if not exists target_recommendations_trainer_idx on public.target_recommendations(trainer_id, client_id, created_at desc);

-- 12. Trainer-Defined Client Plans (phases, meal splits, water/steps targets & action checklists)
create table if not exists public.trainer_client_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  phase_title text not null default 'Custom Nutrition Phase',
  coach_summary text not null default '',
  daily_water_goal_ml integer not null default 2500,
  daily_steps_target integer not null default 8000,
  meal_guidelines jsonb not null default '[]'::jsonb,
  action_items text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(trainer_id, client_id)
);

create index if not exists trainer_client_plans_client_idx on public.trainer_client_plans(client_id, updated_at desc);

-- 13. AI Photo & Voice Meal Scans History (stored per user in Supabase)
create table if not exists public.ai_meal_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_mode text not null check (input_mode in ('photo', 'voice', 'text')),
  meal_type text not null default 'lunch',
  meal_title text not null,
  transcript_or_notes text,
  detected_items jsonb not null default '[]'::jsonb,
  total_calories numeric not null default 0,
  total_protein numeric not null default 0,
  total_carbs numeric not null default 0,
  total_fat numeric not null default 0,
  total_fibre numeric not null default 0,
  confidence text not null default 'moderate',
  nutrition_tip text,
  image_storage_path text,
  logged_to_diary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_meal_scans_user_idx on public.ai_meal_scans(user_id, created_at desc);

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
alter table public.target_recommendations enable row level security;
alter table public.trainer_client_plans enable row level security;
alter table public.ai_meal_scans enable row level security;

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

-- Strict Trainer Privacy & Consent Policies
drop policy if exists "Trainers manage own trainer profile" on public.trainer_profiles;
create policy "Trainers manage own trainer profile" on public.trainer_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Clients read connected or inviting trainer profiles" on public.trainer_profiles;
create policy "Clients read connected or inviting trainer profiles" on public.trainer_profiles
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = trainer_profiles.user_id
        and tc.client_id = auth.uid()
    )
    or exists (
      select 1 from public.client_invitations ci
      where ci.trainer_id = trainer_profiles.user_id
        and ci.status = 'pending'
        and lower(ci.client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "Clients control trainer permissions" on public.trainer_clients;
create policy "Clients control trainer permissions" on public.trainer_clients
  for all using (auth.uid() = client_id or auth.uid() = trainer_id)
  with check (auth.uid() = client_id);

drop policy if exists "Trainers manage own invitations" on public.client_invitations;
create policy "Trainers manage own invitations" on public.client_invitations
  for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "Invited clients read own email invitations" on public.client_invitations;
create policy "Invited clients read own email invitations" on public.client_invitations
  for select using (
    lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and client_email <> ''
  );

drop policy if exists "Authorized trainers read client profiles" on public.profiles;
create policy "Authorized trainers read client profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = profiles.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_profile = true
    )
  );

drop policy if exists "Authorized trainers read client nutrition goals" on public.nutrition_goals;
create policy "Authorized trainers read client nutrition goals" on public.nutrition_goals
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = nutrition_goals.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_goals = true
    )
  );

drop policy if exists "Authorized trainers read client weight goals" on public.weight_goals;
create policy "Authorized trainers read client weight goals" on public.weight_goals
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = weight_goals.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_goals = true
    )
  );

drop policy if exists "Authorized trainers read food entries" on public.food_entries;
create policy "Authorized trainers read food entries" on public.food_entries
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = food_entries.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
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
        and tc.is_archived = false
        and tc.can_view_weight = true
    )
  );

drop policy if exists "Authorized trainers read weekly analytics" on public.weekly_analytics;
create policy "Authorized trainers read weekly analytics" on public.weekly_analytics
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = weekly_analytics.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_nutrition = true
    )
  );

-- Trainer notes: strictly isolated per trainer (Client & authoring trainer only; never shared across trainers)
drop policy if exists "Authorized trainers manage notes" on public.trainer_notes;
create policy "Authorized trainers manage notes" on public.trainer_notes
  for all using (
    auth.uid() = trainer_id and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = trainer_notes.client_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.can_add_notes = true
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
  with check (
    auth.uid() = client_id or (
      auth.uid() = trainer_id and exists (
        select 1 from public.trainer_clients tc
        where tc.client_id = weekly_client_checkins.client_id
          and tc.trainer_id = auth.uid()
          and tc.status = 'active'
      )
    )
  );

drop policy if exists "Trainer and client manage target recommendations" on public.target_recommendations;
create policy "Trainer and client manage target recommendations" on public.target_recommendations
  for select using (auth.uid() = client_id or auth.uid() = trainer_id);

drop policy if exists "Trainers create target recommendations for active clients" on public.target_recommendations;
create policy "Trainers create target recommendations for active clients" on public.target_recommendations
  for insert with check (
    auth.uid() = trainer_id and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = target_recommendations.client_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
    )
  );

drop policy if exists "Clients respond to target recommendations" on public.target_recommendations;
create policy "Clients respond to target recommendations" on public.target_recommendations
  for update using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- Trainer-defined plans policies
drop policy if exists "Authorized trainers manage client plans" on public.trainer_client_plans;
create policy "Authorized trainers manage client plans" on public.trainer_client_plans
  for all using (
    auth.uid() = trainer_id and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = trainer_client_plans.client_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_manage_goals = true
    )
  )
  with check (
    auth.uid() = trainer_id and exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = trainer_client_plans.client_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_manage_goals = true
    )
  );

drop policy if exists "Clients read own trainer plans" on public.trainer_client_plans;
create policy "Clients read own trainer plans" on public.trainer_client_plans
  for select using (auth.uid() = client_id);

-- AI meal scan policies
drop policy if exists "Users manage own ai meal scans" on public.ai_meal_scans;
create policy "Users manage own ai meal scans" on public.ai_meal_scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Authorized trainers read client ai meal scans" on public.ai_meal_scans;
create policy "Authorized trainers read client ai meal scans" on public.ai_meal_scans
  for select using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.client_id = ai_meal_scans.user_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
        and tc.is_archived = false
        and tc.can_view_nutrition = true
    )
  );

-- Optional Storage Bucket for Meal Scan Photos (private per user folder)
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('meal-photos', 'meal-photos', false)
  on conflict (id) do nothing;
exception when others then
  null;
end $$;

do $$
begin
  drop policy if exists "Users upload own meal photos" on storage.objects;
  create policy "Users upload own meal photos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "Users read own meal photos" on storage.objects;
  create policy "Users read own meal photos" on storage.objects
    for select to authenticated
    using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
exception when others then
  null;
end $$;

-- Security-Definer RPCs for Invitation Lookup, Acceptance, Goal Management, and Trainer Archive/Removal

create or replace function public.get_invitation_by_token(p_token text)
returns table (
  id uuid,
  trainer_id uuid,
  trainer_name text,
  trainer_bio text,
  trainer_specialties text[],
  client_email text,
  message text,
  status text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ci.id,
    ci.trainer_id,
    coalesce(tp.display_name, 'Fitness Coach') as trainer_name,
    coalesce(tp.bio, '') as trainer_bio,
    coalesce(tp.specialties, '{}'::text[]) as trainer_specialties,
    ci.client_email,
    ci.message,
    ci.status,
    ci.expires_at
  from public.client_invitations ci
  left join public.trainer_profiles tp on tp.user_id = ci.trainer_id
  where ci.invite_token = p_token
  limit 1;
$$;

drop function if exists public.respond_to_trainer_invitation(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean);
create or replace function public.respond_to_trainer_invitation(
  p_invitation_id uuid default null,
  p_invite_token text default null,
  p_accept boolean default true,
  p_can_view_profile boolean default true,
  p_can_view_nutrition boolean default true,
  p_can_view_weight boolean default true,
  p_can_view_goals boolean default true,
  p_can_add_notes boolean default true,
  p_can_manage_goals boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.client_invitations%rowtype;
  v_active_count integer;
  v_max_clients integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  if p_invite_token is not null and length(trim(p_invite_token)) > 0 then
    select * into v_inv
    from public.client_invitations
    where invite_token = trim(p_invite_token)
    limit 1;
  elsif p_invitation_id is not null then
    select * into v_inv
    from public.client_invitations
    where id = p_invitation_id
    limit 1;
  else
    return jsonb_build_object('ok', false, 'error', 'Invitation identifier missing');
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invitation not found');
  end if;

  if v_inv.trainer_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'You cannot accept your own trainer invitation');
  end if;

  if v_inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'This invitation has already been ' || v_inv.status);
  end if;

  if v_inv.expires_at < now() then
    update public.client_invitations set status = 'expired' where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', 'This invitation has expired');
  end if;

  -- If matched by ID without token, require email match
  if (p_invite_token is null or length(trim(p_invite_token)) = 0)
     and length(trim(v_inv.client_email)) > 0
     and lower(trim(v_inv.client_email)) <> v_user_email then
    return jsonb_build_object('ok', false, 'error', 'Invitation email does not match your account');
  end if;

  if not p_accept then
    update public.client_invitations set status = 'declined' where id = v_inv.id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  insert into public.trainer_clients (
    trainer_id,
    client_id,
    status,
    can_view_profile,
    can_view_nutrition,
    can_view_weight,
    can_view_goals,
    can_add_notes,
    can_manage_goals,
    is_archived,
    authorized_at,
    updated_at
  )
  values (
    v_inv.trainer_id,
    v_uid,
    'active',
    p_can_view_profile,
    p_can_view_nutrition,
    p_can_view_weight,
    p_can_view_goals,
    p_can_add_notes,
    p_can_manage_goals,
    false,
    now(),
    now()
  )
  on conflict (trainer_id, client_id) do update set
    status = 'active',
    can_view_profile = excluded.can_view_profile,
    can_view_nutrition = excluded.can_view_nutrition,
    can_view_weight = excluded.can_view_weight,
    can_view_goals = excluded.can_view_goals,
    can_add_notes = excluded.can_add_notes,
    can_manage_goals = excluded.can_manage_goals,
    is_archived = false,
    authorized_at = now(),
    updated_at = now();

  update public.client_invitations
  set status = 'accepted'
  where id = v_inv.id;

  return jsonb_build_object('ok', true, 'status', 'accepted', 'trainer_id', v_inv.trainer_id);
end;
$$;

create or replace function public.trainer_update_client_goals(
  p_client_id uuid,
  p_calories integer,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric,
  p_fibre numeric,
  p_target_weight_kg numeric default null,
  p_preset text default 'custom',
  p_fitness_goal text default null,
  p_goal_speed text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  select exists (
    select 1 from public.trainer_clients tc
    where tc.trainer_id = v_uid
      and tc.client_id = p_client_id
      and tc.status = 'active'
      and tc.is_archived = false
      and tc.can_manage_goals = true
  ) into v_allowed;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'Client has not enabled direct goal editing for your coach account');
  end if;

  if p_calories < 1000 or p_calories > 8000 then
    return jsonb_build_object('ok', false, 'error', 'Calories must be between 1,000 and 8,000 kcal');
  end if;

  insert into public.nutrition_goals (
    user_id,
    preset,
    calories,
    protein,
    carbs,
    fat,
    fibre,
    target_weight_kg,
    goal_speed,
    updated_at
  )
  values (
    p_client_id,
    coalesce(nullif(trim(p_preset), ''), 'custom'),
    p_calories,
    p_protein,
    p_carbs,
    p_fat,
    p_fibre,
    p_target_weight_kg,
    p_goal_speed,
    now()
  )
  on conflict (user_id) do update set
    preset = excluded.preset,
    calories = excluded.calories,
    protein = excluded.protein,
    carbs = excluded.carbs,
    fat = excluded.fat,
    fibre = excluded.fibre,
    target_weight_kg = coalesce(excluded.target_weight_kg, nutrition_goals.target_weight_kg),
    goal_speed = coalesce(excluded.goal_speed, nutrition_goals.goal_speed),
    updated_at = now();

  if p_target_weight_kg is not null or p_fitness_goal is not null or p_goal_speed is not null then
    update public.profiles
    set
      target_weight_kg = coalesce(p_target_weight_kg, target_weight_kg),
      fitness_goal = coalesce(nullif(trim(p_fitness_goal), ''), fitness_goal),
      goal_speed = coalesce(nullif(trim(p_goal_speed), ''), goal_speed),
      updated_at = now()
    where user_id = p_client_id;
  end if;

  if p_target_weight_kg is not null then
    update public.weight_goals
    set target_weight_kg = p_target_weight_kg, updated_at = now()
    where user_id = p_client_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.trainer_manage_client_connection(
  p_relationship_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  if p_action = 'archive' then
    update public.trainer_clients
    set is_archived = true, updated_at = now()
    where id = p_relationship_id and trainer_id = v_uid;
  elsif p_action = 'restore' then
    update public.trainer_clients
    set is_archived = false, updated_at = now()
    where id = p_relationship_id and trainer_id = v_uid;
  elsif p_action = 'remove' then
    update public.trainer_clients
    set status = 'revoked', is_archived = true, updated_at = now()
    where id = p_relationship_id and trainer_id = v_uid;
  else
    return jsonb_build_object('ok', false, 'error', 'Invalid action');
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Client connection not found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.global_foods to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.nutrition_goals, public.weight_goals,
  public.custom_foods, public.food_entries, public.weight_entries, public.user_food_preferences,
  public.ai_usage_logs, public.weekly_analytics, public.trainer_profiles, public.trainer_clients,
  public.client_invitations, public.trainer_notes, public.weekly_client_checkins,
  public.target_recommendations, public.trainer_client_plans, public.ai_meal_scans to authenticated;
grant execute on function public.get_invitation_by_token(text) to authenticated;
grant execute on function public.respond_to_trainer_invitation(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.trainer_update_client_goals(uuid, integer, numeric, numeric, numeric, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.trainer_manage_client_connection(uuid, text) to authenticated;

-- Refresh PostgREST schema cache so new tables, columns, and RPCs work immediately
notify pgrst, 'reload schema';
