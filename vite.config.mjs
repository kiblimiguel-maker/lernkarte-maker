import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { analyticsConfig } from './analytics-config.mjs';
import { legalConfig, legalPublicationReady, privacyPublicationReady } from './legal-config.mjs';

export default defineConfig(() => {
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
