import { json } from '../server/donation-utils.mjs';

export function isDonationCheckoutConfigured(env = process.env) {
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
  const supabasePublicKey = (
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  ).trim();
  const supabaseServerKey = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const appBaseUrl = (env.APP_BASE_URL || '').trim();

  if (!env.STRIPE_SECRET_KEY?.trim() || !env.STRIPE_WEBHOOK_SECRET?.trim() || !supabaseUrl || !supabasePublicKey || !supabaseServerKey || !appBaseUrl) return false;
  try {
    const url = new URL(appBaseUrl);
    return url.protocol === 'https:' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

export function GET() {
  return json({ configured: isDonationCheckoutConfigured() });
}

export function POST() {
  return json({ error: 'Diese Adresse unterstützt nur GET-Anfragen.' }, 405);
}
