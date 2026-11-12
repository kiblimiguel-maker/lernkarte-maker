const fieldSeparator = ' | ';
const verbSidePrefix = '@fr-verb:1 ';
const emptyStem = /^(?:[-–—])?$/u;
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

export const frenchVerbPrompt = `Erstelle aus dem hochgeladenen Vokabular eine Liste französischer Verbkarten für Lernkarten Maker. Übernimm die Verben in der Reihenfolge der Vorlage und schreibe eine Zeile pro Verb.

Trenne die elf Felder mit einem senkrechten Strich. Halte diese Reihenfolge ein.
Deutsche Bedeutung | französischer Infinitiv | Verbstamm | Hilfsverb | Partizip Perfekt | je | tu | il / elle / on | nous | vous | ils / elles

Übernimm den Verbstamm aus der Vorlage. Schreibe — in dieses Feld, wenn kein gemeinsamer Stamm angegeben ist. Verwende als Hilfsverb avoir, être oder avoir / être. Gib danach das französische participe passé an. Schreibe in die letzten sechs Felder jeweils das Subjekt und die vollständige Form im présent de l’indicatif. Verwende bei Bedarf j’ und behalte bei reflexiven Verben das Reflexivpronomen bei.

Gib nur die fertigen Zeilen aus, ohne Überschrift, Aufzählung, Markdown-Tabelle oder Codeblock. Diese Zeile zeigt das Format. Verwende für deine Ausgabe die Verben aus meiner Vorlage.

${frenchVerbExample}`;

function readAuxiliary(value) {
  const auxiliary = value.toLowerCase().replace(/\s*\/\s*/gu, '/');
  if (auxiliary === 'avoir/être' || auxiliary === 'être/avoir') return 'avoir / être';
  return auxiliary === 'avoir' || auxiliary === 'être' ? auxiliary : null;
}

function readVerbFields(fields) {
  const [infinitive, rawStem, rawAuxiliary, participle, ...conjugations] = fields;
  if (!infinitive) return { reason: 'Der französische Infinitiv fehlt.' };

  const auxiliary = readAuxiliary(rawAuxiliary);
  if (!auxiliary) return { reason: 'Beim Hilfsverb ist avoir, être oder avoir / être erforderlich.' };
  if (!participle) return { reason: 'Das Partizip Perfekt fehlt.' };

  const forms = [];
  for (const [index, [subject, pattern]] of presentForms.entries()) {
    const match = conjugations[index].match(pattern);
    if (!match) return { reason: `Die Präsensform für ${subject} fehlt oder beginnt mit einem anderen Pronomen.` };

    const [, rawPronoun, form] = match;
    const pronoun = rawPronoun.replace(/\s*\/\s*/gu, ' / ');
    const separator = /['’]$/u.test(pronoun) ? '' : ' ';
    forms.push({ pronoun, form, separator });
  }

  const stem = emptyStem.test(rawStem) ? '' : rawStem;
  return { verb: { infinitive, stem, auxiliary, participle, forms } };
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

export function formatFrenchVerbSide({ infinitive, stem, auxiliary, participle, forms }) {
  const fields = [infinitive, stem || '—', auxiliary, participle,
    ...forms.map(({ pronoun, separator, form }) => `${pronoun}${separator}${form}`),
  ];
  return verbSidePrefix + fields.join(fieldSeparator);
}

export function parseFrenchVerbImport(text) {
  const rows = [];
  const errors = [];
  const lines = String(text ?? '').replace(/^\uFEFF/u, '').split(/\r\n?|\n|\u2028|\u2029/u);

  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const line = index + 1;
    const [front, ...fields] = raw.split('|').map(field => field.trim());
    if (fields.length !== 10) {
      errors.push({ line, text: raw, reason: 'Eine Verbzeile braucht elf Felder, getrennt durch |.' });
      continue;
    }
    if (!front) {
      errors.push({ line, text: raw, reason: 'Die deutsche Bedeutung fehlt.' });
      continue;
    }

    const { verb, reason } = readVerbFields(fields);
    if (!verb) {
      errors.push({ line, text: raw, reason });
      continue;
    }

    rows.push({ line, front, back: formatFrenchVerbSide(verb) });
  }

  return { rows, errors };
}
