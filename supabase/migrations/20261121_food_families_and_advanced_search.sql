-- ============================================================================
-- CALOREX / CALOTHRIX NUTRITION INTELLIGENCE MIGRATION
-- Additive, Backward-Compatible Food Families, Data Quality & Advanced Search
-- ============================================================================
-- Preserves all existing food IDs, food_entries, custom_foods, recipes,
-- trainer tables, and the existing search_foods_master RPC return signature.
-- Safe to run multiple times (fully idempotent).
-- ============================================================================

create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Food Families (Parent-Child & Category Hierarchy)
-- ----------------------------------------------------------------------------
create table if not exists public.food_families (
  id text primary key,
  slug text unique not null,
  display_name text not null,
  parent_family_id text references public.food_families(id) on delete set null,
  category text not null default 'Indian foods',
  aliases text[] not null default '{}'::text[],
  regional_names text[] not null default '{}'::text[],
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_food_families_slug on public.food_families(slug);
create index if not exists idx_food_families_parent on public.food_families(parent_family_id);
create index if not exists idx_food_families_aliases_gin on public.food_families using gin(aliases);

-- Seed core Indian-first food families (idempotent)
insert into public.food_families (id, slug, display_name, category, aliases, regional_names, description) values
  ('paneer', 'paneer', 'Paneer & Indian Cottage Cheese', 'Dairy', array['paneer','panner','cottage cheese','chhena','chenna'], array['ಪನೀರ್','पनीर'], 'Fresh paneer, low-fat paneer, and cooked paneer dishes'),
  ('rice', 'rice', 'Rice & Rice Dishes', 'Indian foods', array['rice','chawal','bhat','bhaat','anna','sadam','akki','basmati','biryani','pulao'], array['ಅಕ್ಕಿ','ಅನ್ನ','चावल','சாதம்'], 'Raw rice grains, cooked/steamed rice, and prepared rice dishes'),
  ('chicken', 'chicken', 'Chicken & Poultry', 'Meat and poultry', array['chicken','chiken','murgh','murgi','koli','kozhi','poultry'], array['ಕೋಳಿ','चिकन','கோழி'], 'Raw chicken cuts, boiled/grilled chicken, and chicken curries'),
  ('egg', 'egg', 'Eggs & Egg Preparations', 'Meat and poultry', array['egg','eggs','anda','ande','motte','muttai','omelette','omlet','bhurji'], array['ಮೊಟ್ಟೆ','अंडा','முட்டை'], 'Raw eggs, boiled eggs, egg whites, omelettes, and egg curries'),
  ('dal', 'dal', 'Dal, Lentils & Pulses', 'Indian foods', array['dal','daal','dhal','lentil','lentils','bele','paruppu','toor','moong','masoor','chana','urad','rajma','chole'], array['ಬೇಳೆ','दाल','பருப்பு'], 'Raw lentils/pulses, cooked plain dal, and tempered dal dishes'),
  ('milk', 'milk', 'Milk & Dairy Beverages', 'Dairy', array['milk','doodh','dudh','haalu','paal','toned milk','full cream'], array['ಹಾಲು','दूध','பால்'], 'Cow milk, buffalo milk, toned milk, and flavoured milk'),
  ('curd', 'curd', 'Curd, Yogurt & Buttermilk', 'Dairy', array['curd','dahi','yogurt','yoghurt','mosaru','thayir','chaas','lassi','majjige','buttermilk','raita'], array['ಮೊಸರು','ಮಜ್ಜಿಗೆ','दही','தயிர்'], 'Plain curd, Greek yogurt, buttermilk, lassi, and raita'),
  ('wheat_roti', 'wheat_roti', 'Wheat, Roti, Chapati & Paratha', 'Indian foods', array['roti','chapati','chapatti','phulka','paratha','parantha','atta','wheat','naan','poori','puri','rotti'], array['ರೊಟ್ಟಿ','ಚಪಾತಿ','रोटी','चपाती'], 'Whole wheat flour, plain chapati/roti, parathas, and Indian flatbreads'),
  ('ragi', 'ragi', 'Ragi & Finger Millet', 'Indian foods', array['ragi','nachni','finger millet','ragi mudde','ragi rotti','ragi ganji','ragi malt'], array['ರಾಗಿ','ರಾಗಿ ಮುದ್ದೆ','रागी'], 'Raw ragi flour, steamed ragi mudde, ragi rotti, and ragi porridge'),
  ('millet_rotti', 'millet_rotti', 'Karnataka & Regional Rottis', 'Indian foods', array['akki rotti','jolada rotti','ragi rotti','jowar roti','bajra roti','rice roti'], array['ಅಕ್ಕಿ ರೊಟ್ಟಿ','ಜೋಳದ ರೊಟ್ಟಿ'], 'Traditional Karnataka and Indian millet/rice flatbreads'),
  ('dosa', 'dosa', 'Dosa & Savory Crepes', 'Indian foods', array['dosa','dose','dosai','masala dosa','set dosa','neer dosa','rava dosa','uttapam','pesarattu','chilla'], array['ದೋಸೆ','ನೀರ್ ದೋಸೆ','डोसा','தோசை'], 'Plain dosa, masala dosa, neer dosa, set dosa, and Mysore masala dosa'),
  ('idli', 'idli', 'Idli & Steamed Cakes', 'Indian foods', array['idli','idly','rava idli','thatte idli','mallige idli','dhokla'], array['ಇಡ್ಲಿ','इडली','இட்லி'], 'Steamed rice-urad idli, rava idli, thatte idli, and dhokla'),
  ('sambar_rasam', 'sambar_rasam', 'Sambar, Huli & Rasam/Saaru', 'Indian foods', array['sambar','sambhar','huli','rasam','saaru','tili saaru','dal sambar'], array['ಸಾಂಬಾರ್','ಹುಳಿ','ಸಾರು','सांभर','சாம்பார்'], 'South Indian and Karnataka sambar, huli, and rasam/saaru'),
  ('poha_upma', 'poha_upma', 'Poha, Upma & Breakfast Bowls', 'Indian foods', array['poha','avalakki','upma','uppittu','khara bath','kesari bath','pongal','khichdi','daliya'], array['ಅವಲಕ್ಕಿ','ಉಪ್ಪಿಟ್ಟು','ಖಾರಾ ಬಾತ್','पोहा','उपमा'], 'Flattened rice poha, rava upma, khara bath, pongal, and khichdi'),
  ('vada_snacks', 'vada_snacks', 'Vada & Indian Savory Snacks', 'Indian foods', array['vada','wada','medu vada','uddina vada','maddur vada','masala vada','samosa','pakora','bhajji','bonda'], array['ವಡೆ','ಮದ್ದೂರು ವಡೆ','वड़ा'], 'Medu vada, Maddur vada, masala vada, and traditional snacks'),
  ('fish_seafood', 'fish_seafood', 'Fish & Seafood', 'Fish and seafood', array['fish','machli','meenu','meen','rohu','salmon','tuna','prawns','shrimp','pomfret','surmai','bangda','mackerel'], array['ಮೀನು','मछली','மீன்'], 'Raw fish, steamed/grilled fish, prawns, and fish curries'),
  ('mutton_meat', 'mutton_meat', 'Mutton, Lamb & Red Meat', 'Meat and poultry', array['mutton','lamb','goat','gosht','keema','pork','beef'], array['ಮಟನ್','मटन'], 'Raw cuts and cooked mutton/meat dishes'),
  ('vegetables', 'vegetables', 'Vegetables & Sabzi', 'Vegetables', array['vegetable','vegetables','sabzi','subzi','palya','poriyal','bhaji','palak','spinach','potato','aloo','gobi','bhindi','brinjal','avarekalu','kosambari','mushroom','mushrooms'], array['ತರಕಾರಿ','ಪಲ್ಯ','सब्जी'], 'Raw vegetables, mushrooms, boiled/steamed vegetables, palya, and vegetable curries'),
  ('fruits', 'fruits', 'Fruits & Fresh Produce', 'Fruits', array['fruit','fruits','banana','apple','mango','papaya','orange','guava','pomegranate','grapes','watermelon','hannu'], array['ಹಣ್ಣು','फल'], 'Fresh whole fruits and fruit preparations'),
  ('nuts_seeds', 'nuts_seeds', 'Nuts, Seeds & Nut Butters', 'Nuts and seeds', array['nuts','seeds','almond','badam','cashew','kaju','peanut','groundnut','walnut','chia','flax','peanut butter'], array['ಬಾದಾಮಿ','ಗೋಡಂಬಿ','ಶೇಂಗಾ'], 'Raw and roasted nuts, seeds, and nut butters'),
  ('oils_ghee', 'oils_ghee', 'Ghee, Butter & Cooking Oils', 'Dairy', array['ghee','thuppa','tuppa','butter','oil','coconut oil','olive oil','groundnut oil','mustard oil'], array['ತುಪ್ಪ','ಬೆಣ್ಣೆ','घी'], 'Clarified butter (ghee), butter, and edible cooking oils'),
  ('soya_tofu', 'soya_tofu', 'Soya, Tofu & Plant Protein', 'Indian foods', array['soya','soy','tofu','soya chunks','nutrela','tempeh','edamame'], array['ಸೋಯಾ','सोया'], 'Soya chunks, firm tofu, and plant-protein preparations'),
  ('oats_grains', 'oats_grains', 'Oats, Quinoa & Whole Grains', 'Grains and cereals', array['oats','oatmeal','quinoa','barley','jowar','bajra','millets','foxtail','vermicelli','semolina','rava','suji'], array['ಓಟ್ಸ್','ಜೋಳ','ಸಜ್ಜೆ'], 'Dry whole grains, porridge, oatmeal, and cooked cereals'),
  ('sweets_desserts', 'sweets_desserts', 'Indian Sweets & Desserts', 'Indian foods', array['sweet','dessert','holige','obbattu','puran poli','mysore pak','payasam','kheer','halwa','ladoo','gulab jamun','jalebi'], array['ಹೋಳಿಗೆ','ಒಬ್ಬಟ್ಟು','ಮೈಸೂರು ಪಾಕ್','मिठाई'], 'Traditional Indian and Karnataka sweets'),
  ('beverages', 'beverages', 'Tea, Coffee & Beverages', 'Beverages', array['tea','chai','coffee','filter coffee','juice','coconut water','ragi ganji','kanji','smoothie','shake'], array['ಕಾಫಿ','ಚಹಾ','चाय'], 'Hot and cold beverages, filter coffee, chai, and health drinks'),
  ('cheese_dairy', 'cheese_dairy', 'Cheese & Dairy Products', 'Dairy', array['cheese','cheddar','mozzarella','khoa','khoya','mawa','cream'], array['ಚೀಸ್','चीज़'], 'Natural and processed cheeses and concentrated milk solids'),
  ('bread_bakery', 'bread_bakery', 'Breads, Buns & Bakery', 'Grains and cereals', array['bread','toast','bun','pav','sandwich','biscuit','cake','muffin'], array['ಬ್ರೆಡ್','ब्रेड'], 'Whole wheat bread, pav, buns, sandwiches, and bakery items'),
  ('supplements', 'supplements', 'Protein & Sports Supplements', 'Supplements', array['whey','protein','casein','creatine','protein bar','isolate'], array['ಪ್ರೋಟೀನ್'], 'Whey protein powders, plant protein, and protein bars')
on conflict (id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  aliases = excluded.aliases,
  regional_names = excluded.regional_names,
  description = excluded.description;

-- ----------------------------------------------------------------------------
-- 2. Register Additional Authoritative Nutrition Sources (Additive)
--    Uses the exact schema of public.food_sources from 20261120_nutrition_intelligence.sql:
--    (id, source_name, source_priority, authority_level, base_url, license, notes)
-- ----------------------------------------------------------------------------
insert into public.food_sources (id, source_name, source_priority, authority_level, base_url, license, notes) values
  ('indb_2024', 'INDB (Indian Nutrient Databank)', 1, 'scientific_reference', 'https://www.indb.org.in/', 'CC BY / Research Attribution', 'Tier 1: Indian Nutrient Databank (INDB) per-100g recipe & food composition'),
  ('uk_fct', 'UK CoFID (McCance and Widdowson 2021)', 2, 'scientific_reference', 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', 'Open Government Licence', 'Tier 2: UK Composition of Foods Integrated Dataset (CoFID 2021)'),
  ('us_fct', 'US FCT / USDA FoodData Central', 2, 'usda_fdc', 'https://fdc.nal.usda.gov/', 'Public Domain (CC0)', 'Tier 2: USDA FoodData Central / US FCT per-100g composition'),
  ('calculated_recipe', 'Calorex Validated Recipe Calculation', 2, 'verified_cooked', null, 'Internal Nutrition Dataset', 'Tier 2: Ingredient-weighted recipe calculation with cooking yield factors from IFCT/INDB'),
  ('gemini_estimated', 'Calorex AI-Assisted Nutrition Estimate', 3, 'verified_cooked', null, 'Internal Nutrition Dataset', 'Tier 3: Controlled Gemini-assisted nutritional estimate with traceable reference foods')
on conflict (id) do update set
  source_name = excluded.source_name,
  source_priority = excluded.source_priority,
  authority_level = excluded.authority_level,
  base_url = excluded.base_url,
  license = excluded.license,
  notes = excluded.notes;

-- ----------------------------------------------------------------------------
-- 3. Additive Columns on public.foods for Families, Grouping, Quality & FTS
--    Also defensively ensures Phase 3 columns exist if 20261120_food_verification_and_search.sql
--    has not been applied yet.
-- ----------------------------------------------------------------------------
alter table public.foods
  add column if not exists canonical_family text,
  add column if not exists version integer not null default 1,
  add column if not exists change_notes text,
  add column if not exists is_discontinued boolean not null default false,
  add column if not exists food_family_id text references public.food_families(id) on delete set null,
  add column if not exists parent_food_id text references public.foods(id) on delete set null,
  add column if not exists result_group text not null default 'prepared_dish',
  add column if not exists preparation_style text,
  add column if not exists quality_status text not null default 'verified',
  add column if not exists is_searchable boolean not null default true,
  add column if not exists canonical_food_id text references public.foods(id) on delete set null,
  add column if not exists calculation_method text,
  add column if not exists source_reference_foods jsonb not null default '[]'::jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists original_source_values jsonb not null default '{}'::jsonb,
  add column if not exists search_text text,
  add column if not exists search_vector tsvector;

-- Add safe check constraints idempotently
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'foods_result_group_check'
  ) then
    alter table public.foods
      add constraint foods_result_group_check
      check (result_group in ('basic_ingredient', 'cooked_food', 'prepared_dish'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'foods_quality_status_check'
  ) then
    alter table public.foods
      add constraint foods_quality_status_check
      check (quality_status in ('verified', 'calculated', 'estimated', 'pending_validation'));
  end if;
end $$;

-- Backfill food_family_id from canonical_family where valid
update public.foods f
set food_family_id = f.canonical_family
where f.food_family_id is null
  and f.canonical_family is not null
  and exists (select 1 from public.food_families ff where ff.id = f.canonical_family);

-- Backfill quality_status from legacy verification_status without overwriting valid rows
update public.foods
set quality_status = case
  when verification_status in ('verified', 'enriched') then 'verified'
  when verification_status = 'estimated' then 'estimated'
  when verification_status = 'needs_review' then 'pending_validation'
  else quality_status
end
where quality_status = 'verified' and verification_status in ('estimated', 'needs_review');

-- ----------------------------------------------------------------------------
-- 4. Full-Text Search Vector Builder & Automatic Trigger
--    Uses public.foods.original_source_code (the real code column on foods).
-- ----------------------------------------------------------------------------
create or replace function public.build_food_search_text(p_food_id text)
returns text
language sql
stable
as $$
  select trim(concat_ws(' ',
    f.food_name,
    coalesce(f.brand, ''),
    coalesce(f.original_source_code, ''),
    coalesce(f.category, ''),
    coalesce(f.food_state, ''),
    coalesce(f.preparation_style, ''),
    coalesce(f.canonical_family, ''),
    coalesce(ff.display_name, ''),
    coalesce(array_to_string(ff.aliases, ' '), ''),
    coalesce(array_to_string(ff.regional_names, ' '), ''),
    coalesce((
      select string_agg(a.alias_name, ' ')
      from public.food_aliases a
      where a.food_id = f.id
    ), '')
  ))
  from public.foods f
  left join public.food_families ff on ff.id = f.food_family_id
  where f.id = p_food_id;
$$;

create or replace function public.foods_sync_search_fields()
returns trigger
language plpgsql
as $$
declare
  v_aliases text;
  v_fam_text text;
begin
  select coalesce(string_agg(alias_name, ' '), '')
    into v_aliases
  from public.food_aliases
  where food_id = new.id;

  select concat_ws(' ', display_name, array_to_string(aliases, ' '), array_to_string(regional_names, ' '))
    into v_fam_text
  from public.food_families
  where id = new.food_family_id;

  new.search_text := trim(concat_ws(' ',
    new.food_name,
    coalesce(new.brand, ''),
    coalesce(new.original_source_code, ''),
    coalesce(new.food_state, ''),
    coalesce(new.preparation_style, ''),
    coalesce(v_aliases, ''),
    coalesce(v_fam_text, '')
  ));

  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.food_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(v_aliases, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.brand, '') || ' ' || coalesce(v_fam_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.category, '') || ' ' || coalesce(new.food_state, '') || ' ' || coalesce(new.preparation_style, '')), 'C');

  return new;
end;
$$;

drop trigger if exists trg_foods_sync_search_fields on public.foods;
create trigger trg_foods_sync_search_fields
before insert or update of food_name, brand, original_source_code, category, food_state, preparation_style, food_family_id, canonical_family
on public.foods
for each row execute function public.foods_sync_search_fields();

create or replace function public.food_aliases_refresh_parent_search()
returns trigger
language plpgsql
as $$
declare
  v_target_id text;
begin
  v_target_id := coalesce(new.food_id, old.food_id);
  update public.foods
  set food_name = food_name
  where id = v_target_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_food_aliases_refresh_search on public.food_aliases;
create trigger trg_food_aliases_refresh_search
after insert or update or delete on public.food_aliases
for each row execute function public.food_aliases_refresh_parent_search();

-- Backfill search_text & search_vector on existing rows
update public.foods set food_name = food_name where search_vector is null;

-- ----------------------------------------------------------------------------
-- 5. Performance Indexes (<200ms target for PostgreSQL FTS + pg_trgm + Family)
-- ----------------------------------------------------------------------------
create index if not exists idx_foods_search_vector_gin on public.foods using gin(search_vector);
create index if not exists idx_foods_search_text_trgm on public.foods using gin(lower(coalesce(search_text, '')) gin_trgm_ops);
create index if not exists idx_foods_family_id on public.foods(food_family_id);
create index if not exists idx_foods_parent_food_id on public.foods(parent_food_id);
create index if not exists idx_foods_result_group on public.foods(result_group);
create index if not exists idx_foods_canonical_food_id on public.foods(canonical_food_id);
create index if not exists idx_foods_quality_searchable on public.foods(is_searchable, quality_status, is_discontinued) where is_custom = false;

-- ----------------------------------------------------------------------------
-- 6. Advanced Food-Family Search RPC with Pagination & Strict Quality Gate
--    Aligned 1-to-1 with real public.foods, public.food_sources, and
--    public.food_nutrients columns.
-- ----------------------------------------------------------------------------
drop function if exists public.search_foods_advanced(text, text, text, text, text, integer, integer);

create or replace function public.search_foods_advanced(
  search_query text,
  filter_category text default null,
  filter_country text default null,
  filter_group text default null,
  filter_family text default null,
  page_limit integer default 40,
  page_offset integer default 0
)
returns table (
  id text,
  source_id text,
  source_name text,
  source_priority integer,
  authority_level text,
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
  food_family_id text,
  parent_food_id text,
  result_group text,
  preparation_style text,
  quality_status text,
  measurement_basis text,
  serving_name text,
  serving_weight_grams numeric,
  liquid_density_g_per_ml numeric,
  dietary_tags text[],
  ingredients_text text,
  verification_status text,
  calculation_method text,
  source_reference_foods jsonb,
  confidence_score numeric,
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
  relevance_score double precision,
  total_count bigint
)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  q text := lower(trim(coalesce(search_query, '')));
  q_clean text := trim(regexp_replace(lower(trim(coalesce(search_query, ''))), '[^a-z0-9\s]+', ' ', 'g'));
  q_tokens text[] := array_remove(regexp_split_to_array(q_clean, '\s+'), '');
  q_token_count integer := coalesce(array_length(q_tokens, 1), 0);
  q_tsquery tsquery;
  wants_raw boolean := q ~ '\m(raw|dry|uncooked|unboiled)\M';
  wants_cooked boolean := q ~ '\m(cooked|boiled|steamed|grilled|roasted|fried|prepared|tadka|masala|curry|tikka|bhurji|biryani|roti|dosa|idli|mudde|rotti)\M';
  matched_family_id text;
begin
  if q_token_count > 0 then
    q_tsquery := websearch_to_tsquery('simple', q_clean);
  end if;

  -- Check if the query directly names a food family (single-concept family expansion)
  if q_token_count <= 2 and q_clean <> '' then
    select ff.id into matched_family_id
    from public.food_families ff
    where lower(ff.id) = q_clean
       or lower(ff.slug) = q_clean
       or lower(ff.display_name) = q_clean
       or q_clean = any(select lower(x) from unnest(ff.aliases) as x)
    limit 1;
  end if;

  return query
  with eligible as (
    select
      f.id,
      f.source_id,
      coalesce(fs.source_name, 'Calothrix Master Catalog') as source_name,
      coalesce(fs.source_priority, 3) as source_priority,
      coalesce(fs.authority_level, 'verified_cooked') as authority_level,
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
      f.food_family_id,
      f.parent_food_id,
      f.result_group,
      f.preparation_style,
      f.quality_status,
      f.measurement_basis,
      f.serving_name,
      f.serving_weight_grams,
      f.liquid_density_g_per_ml,
      f.dietary_tags,
      f.ingredients_text,
      f.verification_status,
      f.calculation_method,
      f.source_reference_foods,
      f.confidence_score,
      f.is_custom,
      f.is_discontinued,
      f.version,
      f.change_notes,
      f.last_updated,
      f.search_vector,
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
      coalesce((
        select array_agg(distinct a.alias_name)
        from public.food_aliases a
        where a.food_id = f.id
      ), '{}'::text[]) as all_aliases
    from public.foods f
    join public.food_nutrients fn on fn.food_id = f.id
    left join public.food_sources fs on fs.id = f.source_id
    where f.is_custom = false
      and f.is_discontinued = false
      and f.is_searchable = true
      and f.quality_status in ('verified', 'calculated', 'estimated')
      -- Strictly enforce complete core 5 macros (never surface NULL/Unavailable)
      and fn.calories_kcal is not null
      and fn.protein_g is not null
      and fn.carbohydrate_g is not null
      and fn.fat_g is not null
      and fn.total_dietary_fibre_g is not null
      and (filter_category is null or filter_category = '' or filter_category = 'All' or f.category = filter_category)
      and (filter_country is null or filter_country = '' or filter_country = 'All' or f.country = filter_country)
      and (filter_group is null or filter_group = '' or f.result_group = filter_group)
      and (filter_family is null or filter_family = '' or f.food_family_id = filter_family)
  ),
  scored as (
    select
      e.*,
      (
        case
          when q = '' then 100.0::double precision
          else (
            -- Exact name / code / barcode match
            (case when lower(e.food_name) = q then 160.0 else 0.0 end)
            + (case when lower(coalesce(e.original_source_code, '')) = q or coalesce(e.barcode, '') = q then 170.0 else 0.0 end)
            -- Exact alias match
            + (case when exists (select 1 from unnest(e.all_aliases) as al where lower(al) = q) then 145.0 else 0.0 end)
            -- Prefix match on food name or alias
            + (case when lower(e.food_name) like q || '%' then 85.0 else 0.0 end)
            + (case when exists (select 1 from unnest(e.all_aliases) as al where lower(al) like q || '%') then 72.0 else 0.0 end)
            -- Substring match on food name
            + (case when lower(e.food_name) like '%' || q || '%' then 48.0 else 0.0 end)
            -- Full-text search rank
            + (case when q_tsquery is not null and e.search_vector @@ q_tsquery
                then least(65.0::double precision, (ts_rank_cd(e.search_vector, q_tsquery) * 55.0)::double precision)
                else 0.0::double precision end)
            -- Trigram typo tolerance on food name and aliases
            + (greatest(
                similarity(lower(e.food_name), q)::double precision,
                coalesce((select max(similarity(lower(al), q))::double precision from unnest(e.all_aliases) as al), 0.0::double precision)
              ) * 62.0)
            -- Family relationship expansion ONLY when query targets a base family concept (e.g. "paneer", "rice")
            + (case when matched_family_id is not null and e.food_family_id = matched_family_id and q_token_count = 1 then 34.0 else 0.0 end)
            -- Multi-token specificity: reward matching ALL tokens in food_name/aliases
            + (case when q_token_count >= 2 and (
                select count(*) from unnest(q_tokens) as tok
                where lower(e.food_name) like '%' || tok || '%'
                   or exists (select 1 from unnest(e.all_aliases) as al where lower(al) like '%' || tok || '%')
              ) = q_token_count then 58.0 else 0.0 end)
            -- State preference: cooked vs raw
            + (case when wants_cooked and e.food_state in ('cooked','boiled','steamed','roasted','grilled','fried','prepared') then 26.0 else 0.0 end)
            - (case when wants_cooked and e.food_state in ('raw','dry') then 42.0 else 0.0 end)
            + (case when wants_raw and e.food_state in ('raw','dry') then 26.0 else 0.0 end)
            - (case when wants_raw and e.food_state in ('cooked','boiled','steamed','prepared') then 24.0 else 0.0 end)
            -- Quality & Indian-first tie-breaker
            + (case when e.quality_status = 'verified' then 6.0 when e.quality_status = 'calculated' then 4.0 else 2.0 end)
            + (case when e.country = 'India' then 4.0 else 0.0 end)
            + (greatest(0, (5 - e.source_priority)) * 2.0)
          )::double precision
        end
      ) as calc_score
    from eligible e
    where q = ''
       or lower(e.food_name) like '%' || q || '%'
       or lower(coalesce(e.brand, '')) like '%' || q || '%'
       or lower(coalesce(e.original_source_code, '')) = q
       or coalesce(e.barcode, '') = q
       or (q_tsquery is not null and e.search_vector @@ q_tsquery)
       or similarity(lower(e.food_name), q) >= 0.24
       or exists (
         select 1 from unnest(e.all_aliases) as al
         where lower(al) like '%' || q || '%' or similarity(lower(al), q) >= 0.32
       )
       or (matched_family_id is not null and q_token_count = 1 and e.food_family_id = matched_family_id)
  ),
  filtered as (
    select * from scored
    where q = '' or calc_score >= (case when q_token_count >= 2 then 32.0 else 22.0 end)
  )
  select
    s.id,
    s.source_id,
    s.source_name,
    s.source_priority,
    s.authority_level,
    s.source_url,
    s.license,
    s.original_source_code,
    s.food_name,
    s.brand,
    s.country,
    s.barcode,
    s.food_group,
    s.category,
    s.food_state,
    s.canonical_family,
    s.food_family_id,
    s.parent_food_id,
    s.result_group,
    s.preparation_style,
    s.quality_status,
    s.measurement_basis,
    s.serving_name,
    s.serving_weight_grams,
    s.liquid_density_g_per_ml,
    s.dietary_tags,
    s.ingredients_text,
    s.verification_status,
    s.calculation_method,
    s.source_reference_foods,
    s.confidence_score,
    s.is_custom,
    s.is_discontinued,
    s.version,
    s.change_notes,
    s.last_updated,
    s.energy_kj,
    s.calories_kcal,
    s.atwater_calories_kcal,
    s.protein_g,
    s.fat_g,
    s.carbohydrate_g,
    s.carbohydrate_basis,
    s.total_dietary_fibre_g,
    s.insoluble_fibre_g,
    s.soluble_fibre_g,
    s.water_g,
    s.ash_g,
    s.micronutrients,
    s.enriched_nutrients,
    coalesce(to_jsonb(s.all_aliases), '[]'::jsonb) as aliases,
    coalesce((
      select jsonb_agg(
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
      )
      from public.food_portions fp
      where fp.food_id = s.id
    ), '[]'::jsonb) as portions,
    s.calc_score as relevance_score,
    count(*) over() as total_count
  from filtered s
  order by s.calc_score desc, s.source_priority asc, length(s.food_name) asc
  limit least(greatest(coalesce(page_limit, 40), 1), 120)
  offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Backward-Compatible search_foods_master RPC
--    Preserves the EXACT 44-column return signature from
--    20261120_food_verification_and_search.sql (prevents PostgreSQL 42P13)
--    while delegating internally to search_foods_advanced.
-- ----------------------------------------------------------------------------
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
  select
    a.id,
    a.source_id,
    a.source_name,
    a.source_priority,
    a.source_url,
    a.license,
    a.original_source_code,
    a.food_name,
    a.brand,
    a.country,
    a.barcode,
    a.food_group,
    a.category,
    a.food_state,
    coalesce(a.canonical_family, a.food_family_id) as canonical_family,
    a.measurement_basis,
    a.serving_name,
    a.serving_weight_grams,
    a.liquid_density_g_per_ml,
    a.dietary_tags,
    a.ingredients_text,
    a.verification_status,
    a.is_custom,
    a.is_discontinued,
    a.version,
    a.change_notes,
    a.last_updated,
    a.energy_kj,
    a.calories_kcal,
    a.atwater_calories_kcal,
    a.protein_g,
    a.fat_g,
    a.carbohydrate_g,
    a.carbohydrate_basis,
    a.total_dietary_fibre_g,
    a.insoluble_fibre_g,
    a.soluble_fibre_g,
    a.water_g,
    a.ash_g,
    a.micronutrients,
    a.enriched_nutrients,
    a.aliases,
    a.portions,
    a.relevance_score as match_rank
  from public.search_foods_advanced(
    search_query,
    filter_category,
    filter_country,
    null,
    null,
    greatest(1, least(coalesce(max_results, 40), 100)),
    0
  ) as a;
$$;

-- ----------------------------------------------------------------------------
-- 8. RLS, Grants & PostgREST Schema Reload
-- ----------------------------------------------------------------------------
alter table public.food_families enable row level security;

drop policy if exists "food_families_read_all" on public.food_families;
create policy "food_families_read_all" on public.food_families
  for select using (true);

do $$
begin
  if to_regprocedure('public.is_calothrix_admin()') is not null then
    execute 'drop policy if exists "Admins manage food families" on public.food_families';
    execute 'create policy "Admins manage food families" on public.food_families for all to authenticated using (public.is_calothrix_admin()) with check (public.is_calothrix_admin())';
  end if;
end $$;

grant select on public.food_families to anon, authenticated;
grant insert, update, delete on public.food_families to authenticated;
grant execute on function public.search_foods_advanced(text, text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.search_foods_master(text, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
