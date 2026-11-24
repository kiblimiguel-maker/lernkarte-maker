import Stripe from 'stripe';
import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';

const readSupabaseUrl = env => (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
const readSupabasePublicKey = env => (
  env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''
).trim();
const readSupabaseLedgerKey = env => (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('STRIPE_NOT_CONFIGURED');
  return new Stripe(secretKey);
}

export function getDonationEventStore() {
  const supabaseUrl = readSupabaseUrl(process.env);
  const secretKey = readSupabaseLedgerKey(process.env);
  if (!supabaseUrl || !secretKey) throw new Error('SUPABASE_SERVER_KEY_NOT_CONFIGURED');
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getAuthenticatedUser(request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: json({ error: 'Bitte melde dich an, um fortzufahren.' }, 401) };

  const supabaseUrl = readSupabaseUrl(process.env);
  const supabaseKey = readSupabasePublicKey(process.env);
  if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_NOT_CONFIGURED');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (isAuthRetryableFetchError(error) || error?.status === 429 || error?.status >= 500) {
    return { error: json({ error: 'Die Anmeldung ist gerade nicht überprüfbar. Bitte versuche es in Kürze erneut.' }, 503) };
  }
  if (error || !data?.user) return { error: json({ error: 'Deine Anmeldung konnte nicht geprüft werden. Bitte melde dich erneut an.' }, 401) };
  return { user: data.user };
}

export function getDonationAppOrigin(env = process.env) {
  try {
    const url = new URL(env.APP_BASE_URL || '');
    if (url.username || url.password) return null;
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? url.origin : null;
  } catch {
    return null;
  }
}

export function isDonationCheckoutConfigured(env = process.env) {
  if (!env.STRIPE_SECRET_KEY?.trim() || !env.STRIPE_WEBHOOK_SECRET?.trim() ||
    !readSupabasePublicKey(env) || !readSupabaseLedgerKey(env) || !getDonationAppOrigin(env)) return false;
  try {
    const url = new URL(readSupabaseUrl(env));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isAllowedAppOrigin(request) {
  const appOrigin = getDonationAppOrigin();
  return Boolean(appOrigin && request.headers.get('origin') === appOrigin);
}
