import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../types/index.ts';

const DEFAULT_ADMIN_EMAILS = ['darshants6364@gmail.com'];

function getConfiguredAdminEmails(): string[] {
  const fromVite =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ADMIN_EMAILS
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env!
          .VITE_ADMIN_EMAILS!
      : '';
  const fromProcess =
    typeof process !== 'undefined' && process.env?.ADMIN_EMAILS ? process.env.ADMIN_EMAILS : '';

  const extra = `${fromVite},${fromProcess}`
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...extra])];
}

/**
 * Strictly restricts internal Nutrition Database Quality & Audit tools to platform admins.
 * Normal users, athletes, and trainers do not see or access this page.
 */
export function isDatabaseAdmin(
  authUser?: Pick<User, 'email' | 'app_metadata' | 'user_metadata'> | null,
  profile?: Pick<UserProfile, 'email' | 'accountRole'> | null
): boolean {
  if (!authUser && !profile) return false;
  if (authUser?.app_metadata?.role === 'admin' || authUser?.app_metadata?.is_admin === true) {
    return true;
  }
  if ((profile?.accountRole as string | undefined) === 'admin') {
    return true;
  }
  const email = (authUser?.email || profile?.email || '').trim().toLowerCase();
  if (!email) return false;
  return getConfiguredAdminEmails().includes(email);
}
