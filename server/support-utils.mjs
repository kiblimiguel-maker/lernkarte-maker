import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

export async function getAuthenticatedUser(request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: json({ error: 'Bitte melde dich an, um fortzufahren.' }, 401) };

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_NOT_CONFIGURED');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Deine Anmeldung konnte nicht geprüft werden. Bitte melde dich erneut an.' }, 401) };
  return { user: data.user };
}

export function isAllowedAppOrigin(request) {
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  const origin = request.headers.get('origin');
  if (!appBaseUrl || !origin) return false;
  try {
    return new URL(origin).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}
