import { supabase } from './supabaseClient.js';

const shareParameter = 'share';
const resumeKey = 'lernkarten-share-oauth-v1';
const tokenPattern = /^[0-9a-f]{64}$/;
const isShareToken = token => typeof token === 'string' && tokenPattern.test(token);

export function libraryShareUrl(token, origin = window.location.origin) {
  if (!isShareToken(token)) throw new TypeError('Ungültiger Freigabelink');
  const url = new URL('/', origin);
  url.hash = new URLSearchParams({ [shareParameter]: token }).toString();
  return url.toString();
}

export function readShareRoute() {
  return new URLSearchParams(window.location.hash.slice(1)).get(shareParameter);
}

export function clearShareRoute() {
  forgetShareForSignIn();
  if (readShareRoute() === null) return;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.delete(shareParameter);
  url.hash = fragment.toString();
  window.history.replaceState(window.history.state, '', url);
}

export function rememberShareForSignIn() {
  const token = readShareRoute();
  if (!isShareToken(token)) return true;
  try {
    window.sessionStorage.setItem(resumeKey, JSON.stringify({ token, expiresAt: Date.now() + 60 * 60 * 1000 }));
    return true;
  } catch {
    return false;
  }
}

export function forgetShareForSignIn() {
  try { window.sessionStorage.removeItem(resumeKey); } catch { /* The browser can block storage. */ }
}

export function restoreShareAfterSignIn() {
  let pending;
  try {
    const raw = window.sessionStorage.getItem(resumeKey);
    if (!raw) return;
    window.sessionStorage.removeItem(resumeKey);
    pending = JSON.parse(raw);
  } catch {
    return;
  }
  if (readShareRoute() !== null || !isShareToken(pending?.token) || !(pending.expiresAt > Date.now())) return;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.set(shareParameter, pending.token);
  url.hash = fragment.toString();
  window.history.replaceState(window.history.state, '', url);
}

async function shareRequest(name, parameters) {
  if (!supabase) throw new Error('Die Freigaben sind derzeit nicht erreichbar.');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function createLibraryShare(kind, id, userId) {
  const token = await shareRequest('create_library_share', { p_kind: kind, p_id: id, p_expected_user: userId });
  if (!isShareToken(token)) throw new Error('Für diesen Inhalt konnte kein Link erstellt werden.');
  return token;
}

export function previewLibraryShare(token) {
  if (!isShareToken(token)) return Promise.resolve(null);
  return shareRequest('preview_library_share', { p_token: token });
}

export function importLibraryShare(token, subjectId, userId) {
  if (!isShareToken(token)) return Promise.resolve(null);
  return shareRequest('import_library_share', { p_token: token, p_subject_id: subjectId || null, p_expected_user: userId });
}
