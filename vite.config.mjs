import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { analyticsConfig } from './analytics-config.mjs';
import { legalConfig, legalPublicationReady, privacyPublicationReady } from './legal-config.mjs';

export function validateClientEnv(env, mode) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value.trim()) continue;
    const key = value.trim();
    if (/^(?:sb_secret_|sk_(?:test|live)_|rk_(?:test|live)_|whsec_)/.test(key)) {
      throw new Error(`${name} enthält einen Serverschlüssel. Öffentliche Build-Variablen sind im Browser lesbar.`);
    }
    const parts = key.split('.');
    if (parts.length !== 3) continue;
    let role;
    try { role = JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role; }
    catch { /* Most public configuration values are not JWTs. */ }
    const publicSupabaseKey = ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'].includes(name);
    if (role === 'service_role' || (publicSupabaseKey && role !== 'anon')) {
      throw new Error(`${name} benötigt einen öffentlichen Schlüssel.`);
    }
  }
  const address = env.VITE_SUPABASE_URL?.trim();
  if (!address) return;
  const url = URL.canParse(address) ? new URL(address) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_SUPABASE_URL benötigt die HTTP(S)-Projektadresse ohne Zugangsdaten, Suchparameter oder Fragment.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (mode === 'production' && url.protocol === 'http:' && !loopback) {
    throw new Error('VITE_SUPABASE_URL benötigt für den Produktivbetrieb eine HTTPS-Verbindung.');
  }
}

export default defineConfig(({ mode }) => {
  validateClientEnv(loadEnv(mode, process.cwd(), 'VITE_'), mode);
  const pages = [];
  if (privacyPublicationReady()) pages.push('privacy');
  if (legalPublicationReady()) pages.push('terms', 'imprint');
  const automaticDeletion = existsSync(new URL('./api/delete-account.mjs', import.meta.url));
  const documents = {};

  if (pages.length > 0) {
    const source = new URL('./legal-release.json', import.meta.url);
    if (!existsSync(source)) throw new Error('Freigegebene Rechtstexte fehlen für den Build.');
    const release = JSON.parse(readFileSync(source, 'utf8'));
    for (const page of pages) {
      const document = release.documents?.[page];
      if (!document?.sections?.length || document.version !== legalConfig.publication.version ||
          document.date !== legalConfig.publication.updatedAt || /\[INTERN OFFEN\b/.test(JSON.stringify(document))) {
        throw new Error(`Der freigegebene Rechtstext «${page}» ist unvollständig.`);
      }
      documents[page] = document;
    }
    if (analyticsConfig.enabled && release.analyticsConsentVersion !== analyticsConfig.consentVersion) {
      throw new Error('Die veröffentlichte Datenschutzerklärung muss zur Analytics-Einwilligungsversion passen.');
    }
  }

  if (analyticsConfig.enabled && (analyticsConfig.releaseApproved !== true || !documents.privacy)) {
    throw new Error('Analytics benötigt die Freigabe und eine veröffentlichte Datenschutzerklärung.');
  }

  return {
    define: {
      __PUBLISHED_LEGAL_DOCUMENTS__: JSON.stringify(documents),
      __PRIVACY_DOCUMENT_RELEASED__: JSON.stringify(Boolean(documents.privacy)),
      __ACCOUNT_DELETION_RELEASED__: JSON.stringify(automaticDeletion)
    }
  };
});
