import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import { legalPublicationReady } from './legal-config.mjs';

const legalDocumentsReleased = legalPublicationReady();
if (legalDocumentsReleased && !existsSync(new URL('./legal-content.mjs', import.meta.url))) {
  throw new Error('Freigegebene Rechtstexte fehlen für den Build.');
}

export default defineConfig({
  define: {
    __LEGAL_DOCUMENTS_RELEASED__: JSON.stringify(legalDocumentsReleased),
    __ACCOUNT_DELETION_RELEASED__: JSON.stringify(existsSync(new URL('./api/delete-account.mjs', import.meta.url)))
  }
});
