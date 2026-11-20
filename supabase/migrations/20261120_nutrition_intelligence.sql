-- Calothrix Nutrition Database Accuracy & Intelligence Enhancement
-- Backward-compatible additive migration: preserves all existing tables (profiles, food_entries, custom_foods,
-- weight_entries, nutrition_goals, trainer_*, global_foods, ai_meal_scans) without breaking existing data.

-- 1. Canonical Food Sources Hierarchy
create table if not exists public.food_sources (
  id text primary key,
  source_name text not null unique,
  source_priority integer not null, -- 1 = IFCT 2017 Raw, 2 = Verified Cooked/Recipe, 3 = USDA FDC, 4 = Verified Packaged, 5 = Open Food Facts, 6 = User Custom
  authority_level text not null check (authority_level in ('scientific_reference', 'verified_cooked', 'usda_fdc', 'manufacturer_label', 'community_open_data', 'user_provided')),
  base_url text,
  license text not null,
  notes text,
  created_at timestamptz not null default now()
);

insert into public.food_sources (id, source_name, source_priority, authority_level, base_url, license, notes)
values
  ('ifct_2017', 'ICMR-NIN IFCT 2017', 1, 'scientific_reference', 'https://ifct2017.com/', 'ICMR-NIN Reference Attribution', 'Primary Indian raw agricultural ingredients & proximate composition master'),
  ('ifct_cooked_verified', 'Calothrix Verified Indian Cooked Reference', 2, 'verified_cooked', null, 'ICMR-NIN IFCT 2017 Derived', 'Cooked Indian dishes with documented yield and ingredient retention'),
  ('usda_fdc', 'USDA FoodData Central', 3, 'usda_fdc', 'https://fdc.nal.usda.gov/', 'USDA Public Domain (CC0)', 'International & USDA SR Legacy / Foundation / Survey foods'),
  ('manufacturer_verified', 'Verified Manufacturer Nutrition Label', 4, 'manufacturer_label', null, 'Manufacturer Label Attribution', 'Verified Indian & international packaged nutrition panel'),
  ('open_food_facts', 'Open Food Facts', 5, 'community_open_data', 'https://in.openfoodfacts.org/', 'ODbL (Open Database License)', 'Community packaged barcode database (India in.openfoodfacts.org & 890* prioritized)'),
  ('user_custom', 'Personal Custom Food', 6, 'user_provided', null, 'Private User Data', 'User-created unverified custom foods')
on conflict (id) do nothing;

-- 2. Master Normalized Foods Table (does not overwrite existing global_foods; enhances with relational audit schema)
create table if not exists public.foods (
  id text primary key,
  source_id text not null references public.food_sources(id),
  original_source_code text, -- Exact IFCT code (e.g., A001), USDA fdcId, or EAN barcode
  source_url text,
  food_name text not null,
  brand text,
  country text default 'India',
  barcode text,
  food_group text,
  category text not null,
  food_state text not null default 'raw', -- raw, cooked, boiled, fried, roasted, steamed, dry, parboiled, fresh, tender, etc.
  measurement_basis text not null default 'per_100g' check (measurement_basis in ('per_100g', 'per_serving', 'per_100ml')),
  serving_name text not null default '100 g',
  serving_weight_grams numeric not null default 100,
  liquid_density_g_per_ml numeric, -- NULL unless food has scientifically defined liquid density
  dietary_tags text[] not null default '{}',
  ingredients_text text,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'enriched', 'estimated', 'user_provided', 'needs_review')),
  is_custom boolean not null default false,
  owner_user_id uuid references auth.users(id) on delete cascade,
  raw_source_snapshot jsonb not null default '{}'::jsonb, -- Immutable audit copy of original imported record
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists foods_source_code_idx on public.foods(source_id, original_source_code);
create index if not exists foods_barcode_idx on public.foods(barcode) where barcode is not null;
create index if not exists foods_state_idx on public.foods(food_state);
create index if not exists foods_verification_idx on public.foods(verification_status);
create index if not exists foods_name_lower_idx on public.foods(lower(food_name));

-- 3. Food Nutrients (Strict NULL preservation — unavailable values remain SQL NULL, never coerced to 0)
create table if not exists public.food_nutrients (
  food_id text primary key references public.foods(id) on delete cascade,
  energy_kj numeric,
  calories_kcal numeric,
  atwater_calories_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbohydrate_g numeric,
  available_carbohydrate_g numeric,
  carbohydrate_basis text not null default 'available' check (carbohydrate_basis in ('available', 'total_by_difference', 'unknown')),
  total_dietary_fibre_g numeric,
  insoluble_fibre_g numeric,
  soluble_fibre_g numeric,
  water_g numeric,
  ash_g numeric,
  micronutrients jsonb not null default '{}'::jsonb,
  -- Cross-source enrichment is strictly isolated from original source columns above
  enriched_nutrients jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. Food Aliases (Regional names, Indian phonetic/spelling variations, search keywords)
create table if not exists public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  food_id text not null references public.foods(id) on delete cascade,
  alias_name text not null,
  alias_type text not null default 'common' check (alias_type in ('exact', 'common', 'regional', 'spelling_variant', 'english', 'ingredient', 'brand')),
  language_region text,
  created_at timestamptz not null default now(),
  unique(food_id, alias_name)
);

create index if not exists food_aliases_lookup_idx on public.food_aliases(lower(alias_name));
create index if not exists food_aliases_food_idx on public.food_aliases(food_id);

-- 5. Standardized Food Portions Table
create table if not exists public.food_portions (
  id uuid primary key default gen_random_uuid(),
  food_id text not null references public.foods(id) on delete cascade,
  portion_name text not null,
  size_variant text check (size_variant in ('small', 'medium', 'large', 'standard')),
  gram_or_ml_weight numeric not null check (gram_or_ml_weight > 0),
  unit_type text not null check (unit_type in ('g', 'ml', 'piece', 'cup', 'bowl', 'katori', 'tbsp', 'tsp', 'glass', 'plate', 'scoop', 'slice')),
  measurement_method text not null default 'standardized_indian_household',
  source_reference text not null default 'ICMR-NIN Dietary Guidelines / Calothrix Reference',
  confidence_level text not null default 'high' check (confidence_level in ('high', 'moderate', 'low')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists food_portions_food_idx on public.food_portions(food_id);

-- 6. Indian Recipe Calculation Engine Tables
create table if not exists public.recipes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Indian foods',
  preparation_style text not null default 'homemade' check (preparation_style in ('homemade', 'restaurant')),
  raw_total_weight_g numeric not null check (raw_total_weight_g > 0),
  cooking_yield_factor numeric not null default 1.0 check (cooking_yield_factor > 0),
  final_cooked_weight_g numeric not null check (final_cooked_weight_g > 0),
  servings_count numeric not null default 1 check (servings_count > 0),
  verification_status text not null default 'estimated' check (verification_status in ('estimated', 'user_provided')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_user_idx on public.recipes(user_id);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes(id) on delete cascade,
  food_id text not null,
  ingredient_name text not null,
  raw_weight_g numeric not null check (raw_weight_g > 0),
  edible_portion_factor numeric not null default 1.0 check (edible_portion_factor > 0 and edible_portion_factor <= 1.0),
  retention_factor numeric not null default 1.0 check (retention_factor > 0 and retention_factor <= 1.5),
  is_cooking_fat boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id);

-- 7. Validation & Quality Audit Logs
create table if not exists public.food_validation_logs (
  id uuid primary key default gen_random_uuid(),
  food_id text not null references public.foods(id) on delete cascade,
  check_code text not null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists food_validation_logs_food_idx on public.food_validation_logs(food_id);
create index if not exists food_validation_logs_severity_idx on public.food_validation_logs(severity, resolved);

-- 8. Barcode Products Cache (Open Food Facts + Manufacturer verified barcodes cached in Supabase)
create table if not exists public.barcode_products (
  barcode text primary key,
  food_id text references public.foods(id) on delete set null,
  product_name text not null,
  brand text,
  country text default 'India',
  is_indian_gs1 boolean generated always as (barcode like '890%') stored,
  source_name text not null,
  source_url text,
  serving_size_label text,
  serving_weight_grams numeric,
  nutrients_per_100g jsonb not null default '{}'::jsonb,
  verification_status text not null default 'needs_review' check (verification_status in ('verified', 'enriched', 'estimated', 'user_provided', 'needs_review')),
  is_discontinued boolean not null default false,
  validation_warnings text[] not null default '{}',
  raw_api_payload jsonb not null default '{}'::jsonb,
  last_validated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists barcode_products_gs1_idx on public.barcode_products(is_indian_gs1);

-- 9. Backward-Compatible Additive Columns on Existing food_entries & custom_foods
alter table public.food_entries add column if not exists unit_label text;
alter table public.food_entries add column if not exists measurement_basis text default 'per_100g';
alter table public.food_entries add column if not exists verification_status text;
alter table public.food_entries add column if not exists food_state text;

alter table public.custom_foods add column if not exists food_state text default 'prepared';
alter table public.custom_foods add column if not exists verification_status text default 'user_provided';

-- 10. Row-Level Security
alter table public.food_sources enable row level security;
alter table public.foods enable row level security;
alter table public.food_nutrients enable row level security;
alter table public.food_aliases enable row level security;
alter table public.food_portions enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.food_validation_logs enable row level security;
alter table public.barcode_products enable row level security;

-- Reference Tables: read-only to authenticated/anon; custom foods isolated to owner
drop policy if exists "Read food sources" on public.food_sources;
create policy "Read food sources" on public.food_sources for select using (true);

drop policy if exists "Read public or own foods" on public.foods;
create policy "Read public or own foods" on public.foods
  for select using (is_custom = false or owner_user_id = auth.uid());

drop policy if exists "Users manage own custom foods v2" on public.foods;
create policy "Users manage own custom foods v2" on public.foods
  for all using (is_custom = true and owner_user_id = auth.uid())
  with check (is_custom = true and owner_user_id = auth.uid());

drop policy if exists "Read accessible food nutrients" on public.food_nutrients;
create policy "Read accessible food nutrients" on public.food_nutrients
  for select using (
    exists (
      select 1 from public.foods f
      where f.id = food_nutrients.food_id
        and (f.is_custom = false or f.owner_user_id = auth.uid())
    )
  );

drop policy if exists "Read food aliases" on public.food_aliases;
create policy "Read food aliases" on public.food_aliases for select using (true);

drop policy if exists "Read food portions" on public.food_portions;
create policy "Read food portions" on public.food_portions for select using (true);

drop policy if exists "Users manage own recipes" on public.recipes;
create policy "Users manage own recipes" on public.recipes
  for all using (user_id is null or user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage own recipe ingredients" on public.recipe_ingredients;
create policy "Users manage own recipe ingredients" on public.recipe_ingredients
  for all using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and (r.user_id is null or r.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "Read barcode products cache" on public.barcode_products;
create policy "Read barcode products cache" on public.barcode_products for select using (true);

drop policy if exists "Authenticated insert barcode cache" on public.barcode_products;
create policy "Authenticated insert barcode cache" on public.barcode_products
  for insert to authenticated with check (true);

drop policy if exists "Admins read validation logs" on public.food_validation_logs;
create policy "Admins read validation logs" on public.food_validation_logs
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.account_role = 'admin'
    )
  );

grant select on public.food_sources, public.foods, public.food_nutrients, public.food_aliases,
  public.food_portions, public.barcode_products to anon, authenticated;
grant select, insert, update, delete on public.recipes, public.recipe_ingredients to authenticated;
grant insert on public.barcode_products to authenticated;
grant select on public.food_validation_logs to authenticated;

notify pgrst, 'reload schema';
