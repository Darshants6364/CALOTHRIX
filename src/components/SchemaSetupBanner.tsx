import React, { useState } from 'react';
import { Check, Copy, Database, ExternalLink, RefreshCw } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { SUPABASE_PROJECT_ID } from '../lib/supabaseClient';

const SQL_SETUP_SNIPPET = `-- Run in Supabase SQL Editor for project ${SUPABASE_PROJECT_ID}
-- Full migration script is also saved at /supabase/schema.sql
create extension if not exists vector;

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

create table if not exists public.weight_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_weight_kg numeric not null default 0,
  target_weight_kg numeric not null default 0,
  goal_direction text not null default 'maintain',
  updated_at timestamptz not null default now()
);

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

create table if not exists public.weight_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric not null,
  date text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_food_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorite_food_ids text[] not null default '{}',
  recent_food_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  query_hash text,
  provider text not null,
  tokens_or_units integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.weight_goals enable row level security;
alter table public.custom_foods enable row level security;
alter table public.food_entries enable row level security;
alter table public.weight_entries enable row level security;
alter table public.user_food_preferences enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own nutrition goals" on public.nutrition_goals;
create policy "Users manage own nutrition goals" on public.nutrition_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own weight goals" on public.weight_goals;
create policy "Users manage own weight goals" on public.weight_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own custom foods" on public.custom_foods;
create policy "Users manage own custom foods" on public.custom_foods for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own food entries" on public.food_entries;
create policy "Users manage own food entries" on public.food_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own weight entries" on public.weight_entries;
create policy "Users manage own weight entries" on public.weight_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own food preferences" on public.user_food_preferences;
create policy "Users manage own food preferences" on public.user_food_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own ai logs" on public.ai_usage_logs;
create policy "Users manage own ai logs" on public.ai_usage_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;`;

export const SchemaSetupBanner: React.FC = () => {
  const { authMode, needsSchemaSetup, syncingDb, retrySupabaseSync } = useMacroLogStore();
  const [copied, setCopied] = useState(false);

  if (authMode !== 'authenticated' || !needsSchemaSetup) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SQL_SETUP_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="mb-5 rounded-2xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/30 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Supabase Database Permissions / Setup Needed
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              Copy and run the SQL script (including table permissions) in your Supabase project (<span className="font-mono-nums">{SUPABASE_PROJECT_ID}</span>), then click Sync Now.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-lime-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied SQL' : 'Copy SQL'}
          </button>

          <a
            href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`}
            target="_blank"
            rel="noreferrer"
            className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5"
          >
            <span>Open SQL Editor</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => void retrySupabaseSync()}
            disabled={syncingDb}
            className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingDb ? 'animate-spin' : ''}`} />
            {syncingDb ? 'Checking...' : 'Sync Now'}
          </button>
        </div>
      </div>
    </div>
  );
};
