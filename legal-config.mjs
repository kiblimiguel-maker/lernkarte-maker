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
  publication: Object.freeze({
    privacyApproved: false, published: false, legallyReviewed: false,
    version: '2026-11-25.1', updatedAt: '2026-11-25'
  }),
  processing: Object.freeze({
    supabaseRegion: 'Irland (eu-west-1)',
    recipientCountries: '',
    transferSafeguards: '',
    retentionPolicy: '',
    backupPolicy: '',
    minorUsagePolicy: '',
    legalBasesAndScope: '',
    processorsReviewed: false
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

const hasPublicValue = value => typeof value === 'string' && value.trim() &&
  !/\[INTERN OFFEN\b|^(?:noch festzulegen|noch offen|TODO|TBD)$/i.test(value.trim());

function privacyPublicationIssues(config) {
  const issues = [];
  const fields = [
    ['publication.version', 'Versionsbezeichnung der Rechtstexte eintragen'],
    ['operator.name', 'Rechtlich verantwortlichen Betreiber eintragen'],
    ['processing.supabaseRegion', 'Tatsächlich verwendete Supabase-Region bestätigen'],
    ['processing.recipientCountries', 'Tatsächliche Empfängerstaaten prüfen und angeben'],
    ['processing.transferSafeguards', 'Anwendbare Garantien für Auslandübermittlungen bestätigen'],
    ['processing.retentionPolicy', 'Speicher- und Löschfristen festlegen'],
    ['processing.backupPolicy', 'Backup-Verfahren und verbleibende Aufbewahrung prüfen'],
    ['processing.minorUsagePolicy', 'Nutzung durch Minderjährige und Einwilligungsfähigkeit rechtlich klären'],
    ['processing.legalBasesAndScope', 'Anwendbares Datenschutzrecht und Bearbeitungsgrundlagen prüfen']
  ];
  for (const [path, label] of fields) {
    const value = path.split('.').reduce((current, key) => current?.[key], config);
    if (!hasPublicValue(value)) issues.push(label);
  }
  const date = config.publication?.updatedAt;
  const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) issues.push('Gültigen Stand der Rechtstexte eintragen');
  if (!contactEmail(config.operator?.email)) issues.push('Gültige Betreiber-E-Mail-Adresse eintragen');
  if (!contactEmail(config.supportEmail)) issues.push('Gültige Support-E-Mail-Adresse eintragen');
  if (config.processing?.processorsReviewed !== true) issues.push('Auftragsbearbeitung, Verträge und Unterauftragsbearbeiter prüfen');
  return issues;
}

export function privacyPublicationReady(config = legalConfig) {
  const publication = config.publication;
  const approved = publication?.privacyApproved === true ||
    (publication?.published === true && publication?.legallyReviewed === true);
  return approved && privacyPublicationIssues(config).length === 0;
}

export function legalPublicationIssues(config = legalConfig) {
  const issues = privacyPublicationIssues(config);
  for (const [key, label] of [
    ['street', 'Geeignete Kontakt- oder Geschäftsadresse eintragen'],
    ['postalCode', 'Postleitzahl eintragen'],
    ['city', 'Ort eintragen']
  ]) {
    if (!hasPublicValue(config.operator?.[key])) issues.push(label);
  }
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
