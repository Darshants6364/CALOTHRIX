import crypto from 'crypto';
import type express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { isDatabaseAdmin } from '../src/utils/adminAccess.ts';

const DEFAULT_SUPABASE_URL = 'https://zzncijlmoskbilxjgiua.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF';

export function getSupabaseConfig(): {
  url: string;
  publishableKey: string;
  serviceRoleKey: string | null;
} {
  const rawUrl = (process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
  let url = DEFAULT_SUPABASE_URL;
  try {
    url = new URL(rawUrl).origin;
  } catch {
    url = DEFAULT_SUPABASE_URL;
  }

  const publishableKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY
  ).trim();

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() || null;
  return { url, publishableKey, serviceRoleKey };
}

export function getSupportEmail(): string {
  return (process.env.SUPPORT_EMAIL || 'privacy@calothrix.app').trim();
}

export function createUserSupabaseClient(token?: string): SupabaseClient {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, {
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceRoleSupabaseClient(): SupabaseClient | null {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface VerifiedActor {
  authenticated: boolean;
  user: User | null;
  userId: string | null;
  token: string | null;
  isAdmin: boolean;
  clientIp: string;
  authError?: string;
}

export function extractBearerToken(req: express.Request): string | null {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 10 ? token : null;
}

export function getClientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export async function resolveRequestActor(req: express.Request): Promise<VerifiedActor> {
  const clientIp = getClientIp(req);
  const token = extractBearerToken(req);
  if (!token) {
    return {
      authenticated: false,
      user: null,
      userId: null,
      token: null,
      isAdmin: false,
      clientIp,
    };
  }

  try {
    const sb = createUserSupabaseClient();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) {
      const msg = error?.message || '';
      return {
        authenticated: false,
        user: null,
        userId: null,
        token: null,
        isAdmin: false,
        clientIp,
        authError: /expired/i.test(msg)
          ? 'Your session has expired. Please refresh or sign in again.'
          : 'Invalid or expired authentication token.',
      };
    }

    return {
      authenticated: true,
      user: data.user,
      userId: data.user.id,
      token,
      isAdmin: isDatabaseAdmin(data.user, null),
      clientIp,
    };
  } catch {
    return {
      authenticated: false,
      user: null,
      userId: null,
      token: null,
      isAdmin: false,
      clientIp,
      authError: 'Unable to verify authentication session right now.',
    };
  }
}

export function createSecurityHeadersMiddleware(): express.RequestHandler {
  const isProd = process.env.NODE_ENV === 'production';
  return helmet({
    // Allow embedding inside AI Studio preview iframe; enforce other protections strictly
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'img-src': ["'self'", 'data:', 'blob:', 'https:'],
            'media-src': ["'self'", 'blob:', 'data:'],
            'connect-src': [
              "'self'",
              'https://*.supabase.co',
              'wss://*.supabase.co',
              'https://world.openfoodfacts.org',
              'https://in.openfoodfacts.org',
              'https://api.nal.usda.gov',
            ],
            'frame-ancestors': ["'self'", 'https://aistudio.google.com', 'https://*.google.com'],
          },
        }
      : false,
  });
}

// General API rate limiter: 180 req/minute per IP
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

// Strict Auth / Account action limiter: 20 req/15 minutes per IP
export const accountMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account requests. Please wait a few minutes before retrying.' },
});

// AI usage tracker (in-memory sliding window per authenticated user or guest IP)
const aiUsageWindows = new Map<string, { count: number; resetAt: number }>();

const GUEST_AI_DAILY_LIMIT = 5;
const AUTH_AI_WINDOW_LIMIT = 35;
const AUTH_AI_WINDOW_MS = 15 * 60 * 1000;
const GUEST_AI_WINDOW_MS = 24 * 60 * 60 * 1000;

function pruneAiUsageWindows(now: number) {
  if (aiUsageWindows.size < 5000) return;
  for (const [k, v] of aiUsageWindows.entries()) {
    if (v.resetAt <= now) aiUsageWindows.delete(k);
  }
}

export async function enforceAiAccessAndQuota(
  req: express.Request,
  res: express.Response,
  options: {
    requireAuth?: boolean;
    guestAllowed?: boolean;
    featureName: string;
  }
): Promise<VerifiedActor | null> {
  const actor = await resolveRequestActor(req);

  if (actor.authError && extractBearerToken(req)) {
    res.status(401).json({ error: actor.authError });
    return null;
  }

  if (options.requireAuth && !actor.authenticated) {
    res.status(401).json({
      error: `Please sign in to use ${options.featureName}.`,
    });
    return null;
  }

  if (!actor.authenticated && options.guestAllowed === false) {
    res.status(401).json({
      error: `Sign in to your free CALOTHRIX account to use ${options.featureName}.`,
    });
    return null;
  }

  const now = Date.now();
  pruneAiUsageWindows(now);

  const key = actor.authenticated ? `user:${actor.userId}` : `guest:${actor.clientIp}`;
  const limit = actor.authenticated ? AUTH_AI_WINDOW_LIMIT : GUEST_AI_DAILY_LIMIT;
  const windowMs = actor.authenticated ? AUTH_AI_WINDOW_MS : GUEST_AI_WINDOW_MS;

  const current = aiUsageWindows.get(key);
  if (!current || current.resetAt <= now) {
    aiUsageWindows.set(key, { count: 1, resetAt: now + windowMs });
    res.setHeader('X-AI-Quota-Limit', String(limit));
    res.setHeader('X-AI-Quota-Remaining', String(limit - 1));
    return actor;
  }

  if (current.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-AI-Quota-Limit', String(limit));
    res.setHeader('X-AI-Quota-Remaining', '0');
    res.status(429).json({
      error: actor.authenticated
        ? `AI usage limit reached (${limit} requests per 15 minutes). Please try again shortly.`
        : `Guest preview allows up to ${GUEST_AI_DAILY_LIMIT} AI scans per day. Sign in for free to unlock higher daily limits and cloud sync.`,
    });
    return null;
  }

  current.count += 1;
  res.setHeader('X-AI-Quota-Limit', String(limit));
  res.setHeader('X-AI-Quota-Remaining', String(Math.max(0, limit - current.count)));
  return actor;
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
  'audio/aac',
]);

export function validateBase64MediaPayload(params: {
  mediaBase64?: unknown;
  mimeType?: unknown;
  kind: 'image' | 'audio';
  maxBytes?: number;
}): { ok: true; cleanBase64: string; mimeType: string } | { ok: false; error: string } {
  const { mediaBase64, mimeType, kind } = params;
  const maxBytes = params.maxBytes ?? (kind === 'image' ? 4 * 1024 * 1024 : 5 * 1024 * 1024);

  if (typeof mediaBase64 !== 'string' || !mediaBase64.trim()) {
    return { ok: false, error: `Missing ${kind} payload.` };
  }

  let raw = mediaBase64.trim();
  let detectedMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    detectedMime = detectedMime || dataUrlMatch[1].toLowerCase();
    raw = dataUrlMatch[2];
  }

  // Strip codec suffixes such as "audio/webm;codecs=opus"
  const normalizedMime = (detectedMime || (kind === 'image' ? 'image/jpeg' : 'audio/webm'))
    .split(';')[0]
    .trim();

  const allowedSet = kind === 'image' ? ALLOWED_IMAGE_MIMES : ALLOWED_AUDIO_MIMES;
  if (!allowedSet.has(normalizedMime)) {
    return {
      ok: false,
      error:
        kind === 'image'
          ? 'Unsupported image format. Please upload JPEG, PNG, or WebP.'
          : 'Unsupported audio format. Please record in WebM, MP4, MP3, or WAV.',
    };
  }

  const compact = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return { ok: false, error: `Invalid ${kind} encoding.` };
  }

  const estimatedBytes = Math.floor((compact.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return {
      ok: false,
      error: `${kind === 'image' ? 'Image' : 'Audio'} exceeds the ${mb} MB upload limit.`,
    };
  }

  return { ok: true, cleanBase64: compact, mimeType: normalizedMime };
}

export function attachRequestId(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const requestId = crypto.randomUUID().slice(0, 12);
  (req as express.Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function logServerError(context: string, req: express.Request, err: unknown): string {
  const requestId =
    (req as express.Request & { requestId?: string }).requestId || 'no-req-id';
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'calothrix',
      context,
      requestId,
      method: req.method,
      path: req.path,
      message,
      timestamp: new Date().toISOString(),
    })
  );
  return requestId;
}

export function sendSafeError(
  req: express.Request,
  res: express.Response,
  context: string,
  err: unknown,
  fallbackMessage: string
): express.Response {
  const e = err as Error & { statusCode?: number; status?: number; expose?: boolean };
  const rawStatus = Number(e?.statusCode || e?.status || 500);
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const requestId = logServerError(context, req, err);

  // Only pass through client-facing 4xx messages; sanitize 5xx internal failures
  const clientMessage =
    status >= 400 && status < 500 && e?.message && !/sql|postgres|stack|api[_ ]?key/i.test(e.message)
      ? e.message
      : fallbackMessage;

  return res.status(status).json({
    error: clientMessage,
    requestId,
  });
}
