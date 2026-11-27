import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, json } from './donation-utils.mjs';

export { json };
export const DELETE_CONFIRMATION = 'KONTO LÖSCHEN';
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const readUrl = env => (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
const readPublicKey = env => (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
const readSecretKey = env => (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export function privacyConfigured(env = process.env) {
  if (!readUrl(env) || !readPublicKey(env) || !readSecretKey(env)) return false;
  try { const url = new URL(readUrl(env)); return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)); }
  catch { return false; }
}

export function getPrivacyServiceClient(env = process.env) {
  if (!privacyConfigured(env)) throw new Error('PRIVACY_NOT_CONFIGURED');
  return createClient(readUrl(env), readSecretKey(env), options);
}

export function sameOrigin(request) {
  const supplied = request.headers.get('origin');
  if (!supplied) return request.method === 'GET';
  try { return supplied === new URL(request.url).origin; } catch { return false; }
}

export async function authenticatePrivacy(request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth;
  if (auth.user.is_anonymous === true) return { error: json({ error: 'Melde dich mit deinem vollständigen Konto an.' }, 401) };
  return { ...auth, token: (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] };
}

export async function readSmallJson(request, maxBytes) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw Object.assign(new Error('Verwende eine JSON-Anfrage.'), { status: 415 });
  if (Number(request.headers.get('content-length')) > maxBytes) throw Object.assign(new Error('Die Anfrage ist zu gross.'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Die Angaben fehlen.'), { status: 400 });
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw Object.assign(new Error('Die Anfrage ist zu gross.'), { status: 413 });
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid body');
    return result;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Prüfe die übermittelten Angaben.'), { status: 400 });
  } finally { await reader.cancel().catch(() => {}); }
}

export function privacyUnavailable() {
  return json({ error: 'Diese Datenschutzfunktion ist noch nicht vollständig eingerichtet. Bitte versuche es später oder verwende den konfigurierten Datenschutzkontakt.', code: 'PRIVACY_UNAVAILABLE' }, 503);
}

// Read only after Supabase getUser verified this exact JWT. Refreshed iat is
// intentionally ignored; the database checks the original live session record.
export function verifiedSessionId(token, verifiedUser) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims.sub === verifiedUser.id && isUuid(claims.session_id) ? claims.session_id : null;
  } catch { return null; }
}
