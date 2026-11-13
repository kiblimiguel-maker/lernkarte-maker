const fieldSeparator = ' | ';
const verbSidePrefix = '@fr-verb:1 ';
const importLineSeparator = /\r\n?|\n|\u2028|\u2029/u;
const isGap = value => /^[-‐‑‒–—―−]*$/u.test(value.replace(/[\s\p{Cf}]/gu, ''));
const presentForms = [
  ['je / j’', /^(je(?=\s)|j['’])\s*(.+)$/iu],
  ['tu', /^(tu)\s+(.+)$/iu],
  ['il / elle / on', /^(il\s*\/\s*elle\s*\/\s*on|il\s*\/\s*elle|il|elle|on)\s+(.+)$/iu],
  ['nous', /^(nous)\s+(.+)$/iu],
  ['vous', /^(vous)\s+(.+)$/iu],
  ['ils / elles', /^(ils\s*\/\s*elles|ils|elles)\s+(.+)$/iu],
];

export const frenchVerbFormLabels = presentForms.map(([label]) => label);

export const frenchVerbExample = 'rennen / laufen | courir | cour- | avoir | couru | je cours | tu cours | il / elle / on court | nous courons | vous courez | ils / elles courent';
const reflexiveExample = 'sich Sorgen machen | s’inquiéter | inquiét- | être | inquiété | je m’inquiète | tu t’inquiètes | il / elle / on s’inquiète | nous nous inquiétons | vous vous inquiétez | ils / elles s’inquiètent';
const impersonalExample = 'man muss | falloir | — | avoir | fallu | — | — | il faut | — | — | —';
const weatherExample = 'regnen | pleuvoir | — | avoir | plu | — | — | il pleut | — | — | —';

export const frenchVerbPrompt = `Erstelle aus dem hochgeladenen Vokabular eine Liste französischer Verbkarten für Lernkarten Maker. Übernimm die Verben in der Reihenfolge der Vorlage und schreibe eine Zeile pro Verb.

Trenne die elf Felder mit einem senkrechten Strich. Halte diese Reihenfolge ein.
Deutsche Bedeutung | französischer Infinitiv | Verbstamm | Hilfsverb | Partizip Perfekt | je | tu | il / elle / on | nous | vous | ils / elles

Schreibe zuerst den deutschen Infinitiv oder die natürliche deutsche Entsprechung und erst im zweiten Feld den französischen Infinitiv. Beispiel: «plaudern | bavarder». Übernimm den Verbstamm aus der Vorlage, einschliesslich eines Bindestrichs wie in «fuy-». Verwende als Hilfsverb avoir, être oder avoir / être. Gib danach das französische participe passé an.

Schreibe in jedes Präsensfeld das Subjekt und die vollständige Form, z. B. «je lance», «j’aime» oder «je m’inquiète». Stimme Übersetzung, Infinitiv, Hilfsverb und Formen aufeinander ab. Verwende bei «beunruhigen» inquiéter mit avoir und j’inquiète. Verwende bei «sich Sorgen machen» s’inquiéter mit être und je m’inquiète.

Schreibe einen einzelnen Strich «—» in jedes Feld ohne Angabe, damit es auf der Karte leer bleibt. Bei unpersönlichen Verben wie falloir und pleuvoir steht die Form mit «il» im dritten Präsensfeld. Die übrigen Präsensfelder bleiben durch «—» als Lücken markiert. Behalte alle elf Felder und alle zehn senkrechten Striche bei.

Prüfe jede Zeile vor der Ausgabe auf Feldanzahl, vollständige Pronomen und Übereinstimmung von Bedeutung und Verbform. Gib nur die fertigen Zeilen aus, ohne Überschrift, Aufzählung, Markdown-Tabelle oder Codeblock. Nutze die folgenden Zeilen als Formatbeispiele und übernimm für deine Ausgabe die Verben aus meiner Vorlage.

${frenchVerbExample}
${reflexiveExample}
${impersonalExample}
${weatherExample}`;

function readAuxiliary(value) {
  const auxiliary = value.toLowerCase().replace(/\s*\/\s*/gu, '/');
  if (auxiliary === 'avoir/être' || auxiliary === 'être/avoir') return 'avoir / être';
  return auxiliary === 'avoir' || auxiliary === 'être' ? auxiliary : null;
}

export function detectImportFormat(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/u, '').split(importLineSeparator);
  let vocabulary = false;

  for (const line of lines) {
    const hasEquals = line.includes('=');
    vocabulary ||= hasEquals;
    if (!line.includes('|')) continue;

    const fields = line.split('|').map(field => field.trim());
    if (hasEquals) {
      if (fields.length === 11 && !fields[0].includes('=') && readVerbFields(fields.slice(1)).verb) return 'french-verbs';
      continue;
    }
    if (fields.length < 7) {
      if (fields[0] && fields[1] && readAuxiliary(fields[3] || '')) return 'french-verbs';
      continue;
    }
    const forms = fields.slice(4);
    const matchingForms = presentForms.filter(([, pattern]) => forms.some(form => pattern.test(form))).length;
    const hasAuxiliary = fields.slice(2, 5).some(readAuxiliary);

    // An incomplete verb row should still get verb-specific validation.
    if (matchingForms >= 4 || (hasAuxiliary && (fields.length === 11 || matchingForms >= 2))
      || (fields.length === 11 && fields[0] && fields[1] && matchingForms > 0 && isGap(fields[3]))) {
      return 'french-verbs';
    }
  }

  return vocabulary ? 'vocabulary' : null;
}

const explicitSubject = /^(?:(?:je|tu|il|elle|on|nous|vous|ils|elles)(?=$|[\s/])|j['’])/iu;
const singleVerbForm = /^\p{L}[\p{L}\p{M}]*$/u;
const reflexiveClitics = [
  /^(?:me\s+|m['’]\s*)/iu, /^(?:te\s+|t['’]\s*)/iu, /^(?:se\s+|s['’]\s*)/iu,
  /^nous\s+/iu, /^vous\s+/iu, /^(?:se\s+|s['’]\s*)/iu,
];

function addSubject(form, index) {
  if (index > 0) return { pronoun: frenchVerbFormLabels[index], separator: ' ', form };
  if (/^h/iu.test(form)) return null; // The spelling alone cannot distinguish h aspiré from h muet.
  return /^[aàâäæeéèêëiîïoôöœuùûüyÿ]/iu.test(form)
    ? { pronoun: 'j’', separator: '', form }
    : { pronoun: 'je', separator: ' ', form };
}

function readPresentForm(value, index, repair) {
  const match = value.match(presentForms[index][1]);
  if (match && (!repair || /\p{L}/u.test(match[2]))) {
    const [, rawPronoun, form] = match;
    const pronoun = rawPronoun.replace(/\s*\/\s*/gu, ' / ');
    return { pronoun, separator: /['’]$/u.test(pronoun) ? '' : ' ', form };
  }
  if (!repair || explicitSubject.test(value) || !singleVerbForm.test(value.replace(reflexiveClitics[index], ''))) return null;
  return addSubject(value, index);
}

function readVerbFields(fields, repair = false) {
  const [infinitive, rawStem, rawAuxiliary, participle, ...conjugations] = fields;
  if (isGap(infinitive)) return { reason: 'Der französische Infinitiv fehlt.' };

  const auxiliary = isGap(rawAuxiliary) ? '' : readAuxiliary(rawAuxiliary);
  if (auxiliary === null) return { reason: 'Beim Hilfsverb sind avoir, être, avoir / être oder ein Strich zulässig.' };

  const forms = [];
  for (const [index, subject] of frenchVerbFormLabels.entries()) {
    const value = conjugations[index];
    const form = isGap(value)
      ? { pronoun: '', separator: '', form: '' }
      : readPresentForm(value, index, repair);
    if (!form) return { reason: `Prüfe das Präsensfeld für ${subject}. Trage das passende Subjekt und die konjugierte Form ein.` };
    forms.push(form);
  }

  const stem = isGap(rawStem) ? '' : rawStem;
  return { verb: { infinitive, stem, auxiliary, participle: isGap(participle) ? '' : participle, forms } };
}

function findReflexiveConflict(verb) {
  const reflexive = verb.forms.every(({ form }, index) => reflexiveClitics[index].test(form));
  if (!reflexive) return null;
  if (/^(?:se\s|s['’])/iu.test(verb.infinitive)) {
    if (!verb.auxiliary || verb.auxiliary === 'être') return null;
    return {
      reason: `«${verb.infinitive}» ist reflexiv und verwendet «être» als Hilfsverb.`,
      replacement: { ...verb, auxiliary: 'être' },
    };
  }
  const reason = `Die Präsensformen sind reflexiv. Prüfe, welche Bedeutung zum Infinitiv «${verb.infinitive}» passt.`;
  if (verb.auxiliary !== 'avoir') return { reason };
  const bareForms = verb.forms.map(({ form }, index) => form.replace(reflexiveClitics[index], ''));
  if (!bareForms.every(form => singleVerbForm.test(form))) return { reason };
  const firstPerson = addSubject(bareForms[0], 0);
  if (!firstPerson) return { reason };
  const forms = verb.forms.map((form, index) => index === 0 ? firstPerson : { ...form, form: bareForms[index] });
  return { reason: reason + ' Der Vorschlag behält den angegebenen Infinitiv und «avoir» bei.', replacement: { ...verb, forms } };
}

export function validateFrenchVerbSide(value) {
  const text = String(value ?? '').trim();
  if (/[\r\n\u2028\u2029]/u.test(text)) return { reason: 'Die Verbformen gehören auf eine Zeile.' };

  const fields = text.split('|').map(field => field.trim());
  return fields.length === 10
    ? readVerbFields(fields)
    : { reason: 'Verwende keine zusätzlichen senkrechten Striche in den Verbformen.' };
}

export function parseFrenchVerbSide(value) {
  const text = String(value ?? '');
  if (!text.startsWith(verbSidePrefix)) return null;
  return validateFrenchVerbSide(text.slice(verbSidePrefix.length)).verb ?? null;
}

function verbFields({ infinitive, stem, auxiliary, participle, forms }) {
  return [infinitive, stem || '—', auxiliary || '—', participle || '—',
    ...forms.map(({ pronoun, separator, form }) => form ? `${pronoun}${separator}${form}` : '—'),
  ];
}

export function formatFrenchVerbSide(verb) {
  return verbSidePrefix + verbFields(verb).join(fieldSeparator);
}

export function parseFrenchVerbImport(text) {
  const rows = [];
  const errors = [];
  const lines = String(text ?? '').replace(/^\uFEFF/u, '').split(importLineSeparator);
  const start = lines.findIndex(line => line.trim());
  const end = lines.findLastIndex(line => line.trim());
  const fence = lines[start]?.trim().match(/^([\x60~])\1{2,}(?=\s|[\w-]|$)/u)?.[0];
  if (fence && end > start && lines[end].trim() === fence) {
    lines[start] = '';
    lines[end] = '';
  }

  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const line = index + 1;
    const [front, ...fields] = raw.split('|').map(field => field.trim());
    if (fields.length !== 10) {
      errors.push({ line, text: raw, reason: 'Eine Verbzeile braucht elf Felder, getrennt durch |.' });
      continue;
    }
    if (isGap(front)) {
      errors.push({ line, text: raw, reason: 'Die deutsche Bedeutung fehlt.' });
      continue;
    }

    const { verb, reason } = readVerbFields(fields, true);
    if (!verb) {
      errors.push({ line, text: raw, reason });
      continue;
    }
    if (front.normalize('NFC').toLowerCase() === verb.infinitive.normalize('NFC').toLowerCase()) {
      errors.push({ line, text: raw, reason: 'Im ersten Feld steht derselbe Infinitiv wie im zweiten. Trage im ersten Feld die deutsche Bedeutung ein.' });
      continue;
    }
    const conflict = findReflexiveConflict(verb);
    if (conflict) {
      const correction = conflict.replacement && [front, ...verbFields(conflict.replacement)].join(fieldSeparator);
      errors.push({ line, text: raw, reason: conflict.reason, ...(correction && { correction }) });
      continue;
    }

    rows.push({ line, front, back: formatFrenchVerbSide(verb) });
  }

  return { rows, errors };
}
