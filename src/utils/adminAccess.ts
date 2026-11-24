import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../types/index.ts';

function getServerAdminEmails(): string[] {
  // Never rely on hardcoded personal emails or client-side env flags for admin authorization.
  // Optional ADMIN_EMAILS is only read on the Node.js server environment as an operational fallback.
  const fromProcess =
    typeof process !== 'undefined' && process.env?.ADMIN_EMAILS ? process.env.ADMIN_EMAILS : '';
  return fromProcess
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Strictly restricts internal Nutrition Database Quality & Audit tools to platform admins.
 * Never trusts client-editable `profiles.accountRole` or `user_metadata`.
 * Requires server-assigned Supabase `app_metadata` admin claim (or server-only ADMIN_EMAILS env).
 */
export function isDatabaseAdmin(
  authUser?: Pick<User, 'email' | 'app_metadata' | 'user_metadata'> | null,
  _profile?: Pick<UserProfile, 'email' | 'accountRole'> | null
): boolean {
  if (!authUser) return false;
  if (
    authUser.app_metadata?.role === 'admin' ||
    authUser.app_metadata?.is_admin === true
  ) {
    return true;
  }
  const email = (authUser.email || '').trim().toLowerCase();
  if (!email) return false;
  const serverAdmins = getServerAdminEmails();
  return serverAdmins.length > 0 && serverAdmins.includes(email);
}
