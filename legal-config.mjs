import { analyticsConfig } from './analytics-config.mjs';

// Enter only information supplied by the legally responsible operator.
// Never populate these fields from an account, repository or hosting profile.
export const legalConfig = Object.freeze({
  appName: 'Lernkarten Maker',
  description: 'Digitale Lernplattform zum Erstellen, Lernen und Teilen von Lernkarten',
  website: 'https://lernkarte-maker.vercel.app/',
  country: 'Schweiz',
  // Values in this file are present in browser builds. Enter a postal address only after approving it for publication.
  operator: Object.freeze({
    name: 'Miguel Kubli',
    street: '',
    postalCode: '',
    city: '',
    email: 'lernkartenmaker@gmail.com'
  }),
  supportEmail: 'lernkartenmaker@gmail.com',
  privacyEmail: 'lernkartenmaker@gmail.com',
  publication: Object.freeze({ published: false, legallyReviewed: false, version: '2026-11-25.1', updatedAt: '2026-11-25' }),
  processing: Object.freeze({
    supabaseRegion: 'Irland (eu-west-1)',
    recipientCountries: '',
    transferSafeguards: '',
    retentionPolicy: '',
    backupPolicy: '',
    minorUsagePolicy: '',
    legalBasesAndScope: '',
    termsLawAndJurisdiction: '',
    processorsReviewed: false,
    googleAnalyticsTermsReviewed: false
  })
});

export function contactEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  const parts = email.split('@');
  if (parts.length !== 2 || email.length > 254) return '';
  const [name, domain] = parts;
  if (name.length > 64 || !/^[a-z0-9_+'-]+(?:\.[a-z0-9_+'-]+)*$/i.test(name)) return '';
  const labels = domain.split('.');
  if (labels.length < 2 || !/^[a-z]{2,63}$/i.test(labels.at(-1))) return '';
  return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ? email : '';
}

export function legalPublicationIssues(config = legalConfig) {
  const issues = [];
  const fields = [
    ['publication.version', 'Versionsbezeichnung der Rechtstexte eintragen'],
    ['operator.name', 'Rechtlich verantwortlichen Betreiber eintragen'],
    ['operator.street', 'Geeignete Kontakt- oder Geschäftsadresse eintragen'],
    ['operator.postalCode', 'Postleitzahl eintragen'], ['operator.city', 'Ort eintragen'],
    ['processing.supabaseRegion', 'Tatsächlich verwendete Supabase-Region bestätigen'],
    ['processing.recipientCountries', 'Tatsächliche Empfängerstaaten prüfen und angeben'],
    ['processing.transferSafeguards', 'Anwendbare Garantien für Auslandübermittlungen bestätigen'],
    ['processing.retentionPolicy', 'Speicher- und Löschfristen festlegen'],
    ['processing.backupPolicy', 'Backup-Verfahren und verbleibende Aufbewahrung prüfen'],
    ['processing.minorUsagePolicy', 'Nutzung durch Minderjährige und Einwilligungsfähigkeit rechtlich klären'],
    ['processing.legalBasesAndScope', 'Anwendbares Datenschutzrecht und Bearbeitungsgrundlagen prüfen'],
    ['processing.termsLawAndJurisdiction', 'Anwendbares Recht und zulässige Zuständigkeit rechtlich prüfen']
  ];
  for (const [path, label] of fields) {
    const value = path.split('.').reduce((current, key) => current?.[key], config);
    if (typeof value !== 'string' || !value.trim() || /\[INTERN OFFEN\b|^(?:noch festzulegen|noch offen|TODO|TBD)$/i.test(value.trim())) issues.push(label);
  }
  const date = config.publication?.updatedAt;
  const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) issues.push('Gültigen Stand der Rechtstexte eintragen');
  if (!contactEmail(config.operator?.email)) issues.push('Gültige Betreiber-E-Mail-Adresse eintragen');
  if (!contactEmail(config.supportEmail)) issues.push('Gültige Support-E-Mail-Adresse eintragen');
  if (config.processing?.processorsReviewed !== true) issues.push('Auftragsbearbeitung, Verträge und Unterauftragsbearbeiter prüfen');
  if (analyticsConfig.enabled && config.processing?.googleAnalyticsTermsReviewed !== true) issues.push('Google-Bedingungen und allfälligen Analytics-Einsatz einschliesslich Minderjährigenschutz prüfen');
  if (config.publication?.legallyReviewed !== true) issues.push('Rechtstexte abschliessend rechtlich prüfen');
  return issues;
}

export function legalPublicationReady(config = legalConfig) {
  return config.publication?.published === true && legalPublicationIssues(config).length === 0;
}

export const legalPages = Object.freeze({
  privacy: 'Datenschutzerklärung', terms: 'Nutzungsbedingungen', imprint: 'Impressum',
  cookies: 'Cookie-Einstellungen', contact: 'Kontakt', report: 'Inhalt melden'
});

export const contactCategories = Object.freeze([
  'Allgemeine Fragen', 'Technische Probleme', 'Verbesserungsvorschläge',
  'Fehler melden', 'Datenschutzanfragen', 'Auskunft über meine Daten', 'Kontolöschung anfragen', 'Urheberrechtsanfragen', 'Inhalt melden'
]);
