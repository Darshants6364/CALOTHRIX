# Calorex Nutrition Dataset Mapping & Reconciliation Report

Generated: 2026-11-21T18:06:37.427Z

## 1. Files Inspected & Actual Formats

| File | Actual Format | Sheets | Rows Found | Searchable Imported | Pending Validation (Quarantined) | Duplicates Reconciled |
|---|---|---|---:|---:|---:|---:|
| `Food Database/IFCT2017_proximate_master_filled.csv` | CSV (UTF-8) | — | 528 | 527 (1 canonical-linked: L003→food-paneer) | 0 | 1 |
| `Food Database/INDB.csv` | XLSX (OpenXML) | `Nutrient Data` | 1014 | 992 | 0 | 22 |
| `Food Database/UK_fct.csv` | XLSX (OpenXML) | `Sheet1`, `notes` | 144 | 91 | 49 | 4 |
| `Food Database/US_fct.csv` | XLSX (OpenXML) | `Sheet1`, `notes` | 54 (of 999 sheet rows; 945 blank) | 44 | 8 | 2 |
| Karnataka & Indian Food-Family Expansion | Calculated (IFCT/INDB) | — | 26 | 26 | 0 | 0 |

## 2. Core Per-100g Column Mappings

- **IFCT 2017 Filled**: `energy_kcal_derived` → Calories, `protein_g` → Protein, `carbohydrate_g` → Carbs, `fat_g` → Total Fat, `total_dietary_fibre_g` → Dietary Fibre.
  - 214 animal/seafood rows carry USDA carb/fibre fills from `carb_fill_note` (preserved as `estimated` with original source metadata).
  - 6 dairy/cane-jaggery/toddy rows (`L001–L004`, `I001`, `K001`) resolved as verified physiological `0g` dietary fibre.
  - 2 plant liquid rows (`E033 Lemon juice`, `K002 Coconut water`) resolved from USDA FDC reference with traceable provenance.
- **INDB**: `energy_kcal`, `protein_g`, `carb_g`, `fat_g`, `fibre_g` (0 missing across all 1,014 rows) + `servings_unit` & `unit_serving_energy_kcal` used to derive household portion weights.
- **UK FCT (CoFID 2021)**: `energy_kcal`, `protein_g`, `carb_g`, `fat_g`, `fibre_g`. `Tr` (trace) mapped cleanly with note; `N` and blank values strictly kept `null` and quarantined as `pending_validation` (`isSearchable: false`).
- **US FCT (USDA)**: `energy_kcal`, `protein_g`, `carb_g`, `fat_g`, `fibre_g`. `NA` and blank values strictly kept `null` and quarantined as `pending_validation`.

## 3. Source Precedence & Deduplication Policy

1. **IFCT 2017** (Indian raw ingredients)
2. **INDB** (Indian recipes & prepared foods)
3. **Existing Curated Calorex IDs** (preserved 100% for historical `food_entries`, favorites & recents; internal duplicates reconciled via `canonicalFoodId` + `isSearchable: false`)
4. **Validated Recipe Calculations** (Karnataka regional dishes & Indian food-family variants)
5. **UK FCT & US FCT** (supplementary international ingredients & foods)
6. **External APIs (USDA / Open Food Facts)** — fallback only when local/Supabase database has insufficient matches.
