-- Calothrix Phase 3: Food Verification Versioning, Canonical Families, Trigram Postgres Search & Admin RLS
-- Strictly additive migration building on 20261120_nutrition_intelligence.sql without breaking existing data.

-- 1. Enable trigram extension for fuzzy & alias Postgres search
create extension if not exists pg_trgm;

-- 2. Align canonical 5-tier food_sources priority + add NCCDB Clinical Reference
alter table public.food_sources
  drop constraint if exists food_sources_authority_level_check;

alter table public.food_sources
  add constraint food_sources_authority_level_check
  check (
    authority_level in (
      'scientific_reference',
      'verified_cooked',
      'usda_fdc',
      'nccdb_clinical',
      'manufacturer_label',
      'community_open_data',
      'user_provided'
    )
  );

insert into public.food_sources (id, source_name, source_priority, authority_level, base_url, license, notes)
values
  ('ifct_2017', 'ICMR-NIN IFCT 2017', 1, 'scientific_reference', 'https://ifct2017.com/', 'ICMR-NIN Reference Attribution', 'Tier 1: Indian raw agricultural ingredients & proximate composition master'),
  ('ifct_cooked_verified', 'Calothrix Verified Indian Cooked Reference', 1, 'verified_cooked', null, 'ICMR-NIN IFCT 2017 Derived', 'Tier 1: Verified cooked Indian & global dishes with yield and retention'),
  ('usda_fdc', 'USDA FoodData Central', 2, 'usda_fdc', 'https://fdc.nal.usda.gov/', 'USDA Public Domain (CC0)', 'Tier 2: USDA Foundation & SR Legacy reference foods'),
  ('nccdb_clinical', 'NCCDB Clinical Reference', 2, 'nccdb_clinical', 'https://nutritiondata.self.com/', 'Clinical Nutrition Reference', 'Tier 2: Clinical food composition database with complete micronutrient profiles'),
  ('manufacturer_verified', 'Verified Manufacturer Nutrition Label', 3, 'manufacturer_label', null, 'Manufacturer Label Attribution', 'Tier 3: Verified manufacturer & restaurant nutrition panels'),
  ('open_food_facts', 'Open Food Facts', 4, 'community_open_data', 'https://in.openfoodfacts.org/', 'ODbL (Open Database License)', 'Tier 4: Community packaged barcode database (890 GS1 India prioritized)'),
  ('user_custom', 'Personal Custom Food', 5, 'user_provided', null, 'Private User Data', 'Tier 5: User-created unverified custom foods')
on conflict (id) do update
  set source_priority = excluded.source_priority,
      authority_level = excluded.authority_level,
      notes = excluded.notes;

-- 3. Additive canonical family, versioning & approval metadata on public.foods
alter table public.foods add column if not exists canonical_family text;
alter table public.foods add column if not exists version integer not null default 1;
alter table public.foods add column if not exists approved_by uuid references auth.users(id);
alter table public.foods add column if not exists approved_at timestamptz;
alter table public.foods add column if not exists change_notes text;
alter table public.foods add column if not exists is_discontinued boolean not null default false;

create index if not exists foods_canonical_family_idx
  on public.foods(canonical_family)
  where canonical_family is not null;

create index if not exists foods_name_trgm_idx
  on public.foods using gin (lower(food_name) gin_trgm_ops);

create index if not exists foods_brand_trgm_idx
  on public.foods using gin (lower(coalesce(brand, '')) gin_trgm_ops);

create index if not exists food_aliases_name_trgm_idx
  on public.food_aliases using gin (lower(alias_name) gin_trgm_ops);

-- 4. Immutable Food Versions Audit Snapshot Table
create table if not exists public.food_versions (
  id uuid primary key default gen_random_uuid(),
  food_id text not null references public.foods(id) on delete cascade,
  version integer not null,
  verification_status text not null check (verification_status in ('verified', 'enriched', 'estimated', 'user_provided', 'needs_review')),
  food_state text not null,
  change_notes text,
  changed_by uuid references auth.users(id),
  food_snapshot jsonb not null,
  nutrients_snapshot jsonb not null default '{}'::jsonb,
  portions_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists food_versions_food_idx
  on public.food_versions(food_id, version desc);

alter table public.food_versions enable row level security;

-- 5. Admin Helper Function for RLS Policies
create or replace function public.is_calothrix_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.account_role = 'admin'
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'darshants6364@gmail.com';
$$;

-- 6. Admin Write / Audit Policies on Reference Tables & Versions
drop policy if exists "Admins manage food sources" on public.food_sources;
create policy "Admins manage food sources" on public.food_sources
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage master foods" on public.foods;
create policy "Admins manage master foods" on public.foods
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage food nutrients" on public.food_nutrients;
create policy "Admins manage food nutrients" on public.food_nutrients
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage food aliases" on public.food_aliases;
create policy "Admins manage food aliases" on public.food_aliases
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage food portions" on public.food_portions;
create policy "Admins manage food portions" on public.food_portions
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage validation logs" on public.food_validation_logs;
create policy "Admins manage validation logs" on public.food_validation_logs
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Admins manage food versions" on public.food_versions;
create policy "Admins manage food versions" on public.food_versions
  for all to authenticated
  using (public.is_calothrix_admin())
  with check (public.is_calothrix_admin());

drop policy if exists "Authenticated read food versions" on public.food_versions;
create policy "Authenticated read food versions" on public.food_versions
  for select to authenticated
  using (true);

drop policy if exists "Authenticated update barcode cache" on public.barcode_products;
create policy "Authenticated update barcode cache" on public.barcode_products
  for update to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.food_sources, public.foods, public.food_nutrients,
  public.food_aliases, public.food_portions, public.food_validation_logs, public.food_versions,
  public.barcode_products to authenticated;

-- 7. Postgres Master Search RPC (preserves SQL NULL nutrients, searches food_name + brand + aliases + code)
create or replace function public.search_foods_master(
  search_query text,
  filter_category text default null,
  filter_country text default null,
  max_results integer default 40
)
returns table (
  id text,
  source_id text,
  source_name text,
  source_priority integer,
  source_url text,
  license text,
  original_source_code text,
  food_name text,
  brand text,
  country text,
  barcode text,
  food_group text,
  category text,
  food_state text,
  canonical_family text,
  measurement_basis text,
  serving_name text,
  serving_weight_grams numeric,
  liquid_density_g_per_ml numeric,
  dietary_tags text[],
  ingredients_text text,
  verification_status text,
  is_custom boolean,
  is_discontinued boolean,
  version integer,
  change_notes text,
  last_updated timestamptz,
  energy_kj numeric,
  calories_kcal numeric,
  atwater_calories_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbohydrate_g numeric,
  carbohydrate_basis text,
  total_dietary_fibre_g numeric,
  insoluble_fibre_g numeric,
  soluble_fibre_g numeric,
  water_g numeric,
  ash_g numeric,
  micronutrients jsonb,
  enriched_nutrients jsonb,
  aliases jsonb,
  portions jsonb,
  match_rank double precision
)
language sql
stable
as $$
  with q as (
    select lower(trim(coalesce(search_query, ''))) as term
  ),
  matched as (
    select
      f.id,
      f.source_id,
      fs.source_name,
      fs.source_priority,
      f.source_url,
      fs.license,
      f.original_source_code,
      f.food_name,
      f.brand,
      f.country,
      f.barcode,
      f.food_group,
      f.category,
      f.food_state,
      f.canonical_family,
      f.measurement_basis,
      f.serving_name,
      f.serving_weight_grams,
      f.liquid_density_g_per_ml,
      f.dietary_tags,
      f.ingredients_text,
      f.verification_status,
      f.is_custom,
      f.is_discontinued,
      f.version,
      f.change_notes,
      f.last_updated,
      fn.energy_kj,
      fn.calories_kcal,
      fn.atwater_calories_kcal,
      fn.protein_g,
      fn.fat_g,
      fn.carbohydrate_g,
      fn.carbohydrate_basis,
      fn.total_dietary_fibre_g,
      fn.insoluble_fibre_g,
      fn.soluble_fibre_g,
      fn.water_g,
      fn.ash_g,
      fn.micronutrients,
      fn.enriched_nutrients,
      (
        select coalesce(jsonb_agg(distinct fa.alias_name), '[]'::jsonb)
        from public.food_aliases fa
        where fa.food_id = f.id
      ) as aliases,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', fp.id::text,
              'foodId', fp.food_id,
              'portionName', fp.portion_name,
              'sizeVariant', fp.size_variant,
              'gramOrMlWeight', fp.gram_or_ml_weight,
              'unitType', fp.unit_type,
              'measurementMethod', fp.measurement_method,
              'sourceReference', fp.source_reference,
              'confidenceLevel', fp.confidence_level,
              'isDefault', fp.is_default
            )
          ),
          '[]'::jsonb
        )
        from public.food_portions fp
        where fp.food_id = f.id
      ) as portions,
      (
        case
          when (select term from q) = '' then 1.0
          when lower(f.food_name) = (select term from q) then 100.0
          when f.barcode = (select term from q) or lower(coalesce(f.original_source_code, '')) = (select term from q) then 98.0
          when exists (
            select 1 from public.food_aliases fa2
            where fa2.food_id = f.id and lower(fa2.alias_name) = (select term from q)
          ) then 92.0
          when lower(f.food_name) like (select term from q) || '%' then 75.0
          when lower(f.food_name) like '%' || (select term from q) || '%' then 55.0
          else greatest(
            similarity(lower(f.food_name), (select term from q)) * 50.0,
            coalesce(
              (
                select max(similarity(lower(fa3.alias_name), (select term from q))) * 48.0
                from public.food_aliases fa3
                where fa3.food_id = f.id
              ),
              0.0
            )
          )
        end
        + greatest(0, 6 - fs.source_priority) * 3.0
      )::double precision as match_rank
    from public.foods f
    join public.food_sources fs on fs.id = f.source_id
    left join public.food_nutrients fn on fn.food_id = f.id
    where f.is_custom = false
      and f.is_discontinued = false
      and (filter_category is null or filter_category = 'All' or f.category = filter_category)
      and (filter_country is null or filter_country = 'All' or f.country = filter_country)
      and (
        (select term from q) = ''
        or lower(f.food_name) like '%' || (select term from q) || '%'
        or lower(coalesce(f.brand, '')) like '%' || (select term from q) || '%'
        or lower(coalesce(f.original_source_code, '')) = (select term from q)
        or f.barcode = (select term from q)
        or similarity(lower(f.food_name), (select term from q)) > 0.22
        or exists (
          select 1 from public.food_aliases fa4
          where fa4.food_id = f.id
            and (
              lower(fa4.alias_name) like '%' || (select term from q) || '%'
              or similarity(lower(fa4.alias_name), (select term from q)) > 0.25
            )
        )
      )
  )
  select *
  from matched
  order by match_rank desc, source_priority asc, food_name asc
  limit greatest(1, least(coalesce(max_results, 40), 100));
$$;

grant execute on function public.search_foods_master(text, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
