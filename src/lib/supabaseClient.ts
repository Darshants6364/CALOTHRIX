import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'zzncijlmoskbilxjgiua';

function normalizeSupabaseUrl(raw?: string): string {
  const fallback = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return fallback;
  }
}

export const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim() ||
  'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'calothrix_supabase_auth',
  },
});
