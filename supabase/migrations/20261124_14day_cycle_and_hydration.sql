-- ============================================================================
-- CALOTHRIX 14-Day Adaptive Progress Cycle & Custom Hydration Support
-- Purely additive migration preserving existing schemas and user data.
-- ============================================================================

alter table if exists public.weekly_assessments
  alter column cycle_days set default 14;

alter table if exists public.nutrition_goals
  add column if not exists hydration_goal_ml integer;
