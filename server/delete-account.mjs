import { authenticatePrivacy, DELETE_CONFIRMATION, getPrivacyServiceClient, json, privacyUnavailable, readSmallJson, sameOrigin, verifiedSessionId } from './privacy-utils.mjs';

async function checkRecentSession(service, userId, sessionId) {
  const { data, error } = await service.rpc('privacy_recent_session', { p_user: userId, p_session: sessionId });
  if (error || typeof data !== 'boolean') throw new Error('Session check unavailable');
  return data;
}

export async function GET(request) {
  if (!sameOrigin(request)) return json({ error: 'Diese Anfrage ist nicht erlaubt.' }, 403);
  const auth = await authenticatePrivacy(request).catch(() => ({ error: privacyUnavailable() }));
  if (auth.error) return auth.error;
  let available = false;
  try {
    // A boolean result confirms the restricted session check is installed.
    // An old session can open the dialog and will be asked to sign in again.
    await checkRecentSession(getPrivacyServiceClient(), auth.user.id, verifiedSessionId(auth.token, auth.user));
    available = true;
  } catch { /* Setup remains closed. */ }
  return json({ available, recentAuthenticationRequired: true });
}

export function createDeleteAccountHandler({ authenticate = authenticatePrivacy, serviceClient = getPrivacyServiceClient } = {}) {
  return async function POST(request) {
    if (!sameOrigin(request)) return json({ error: 'Diese Anfrage ist nicht erlaubt.' }, 403);
    let body;
    try { body = await readSmallJson(request, 1024); }
    catch (error) { return json({ error: error.message }, error.status || 400); }
    if (body.confirmation !== DELETE_CONFIRMATION || Object.keys(body).some(key => key !== 'confirmation')) return json({ error: 'Bestätige die Löschung ausdrücklich mit «KONTO LÖSCHEN».' }, 400);
    const auth = await authenticate(request).catch(() => ({ error: privacyUnavailable() }));
    if (auth.error) return auth.error;
    const sessionId = verifiedSessionId(auth.token, auth.user);
    const reauthenticate = () => json({ error: 'Melde dich zur Sicherheit erneut mit Google an und bestätige die Löschung danach nochmals.', code: 'REAUTH_REQUIRED' }, 401);
    if (!sessionId) return reauthenticate();
    let service;
    try {
      service = serviceClient();
      if (!await checkRecentSession(service, auth.user.id, sessionId)) return reauthenticate();
    } catch { return privacyUnavailable(); }
    try {
      const { error: signOutError } = await service.auth.admin.signOut(auth.token, 'global');
      if (signOutError) return json({ error: 'Die Sitzungen konnten nicht sicher beendet werden. Das Konto wurde nicht gelöscht.' }, 503);
      const { data, error } = await service.auth.admin.deleteUser(auth.user.id, false);
      if (error || (data?.user?.id && data.user.id !== auth.user.id)) throw new Error('Deletion not confirmed');
      // GoTrue can return HTTP 200 with {} after a hard delete. Verify the
      // account's absence in that case instead of trusting an empty payload.
      if (!data?.user?.id) {
        const lookup = await service.auth.admin.getUserById(auth.user.id);
        if (lookup.error?.status !== 404 || lookup.error.code !== 'user_not_found') throw new Error('Deletion not confirmed');
      }
      return json({ deleted: true });
    } catch { return json({ error: 'Die Löschung konnte nicht bestätigt werden. Melde dich erneut an und versuche es nochmals.', code: 'DELETE_FAILED' }, 503); }
  };
}
export const POST = createDeleteAccountHandler();
