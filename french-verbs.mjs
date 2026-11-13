const fieldSeparator = ' | ';
const verbSidePrefix = '@fr-verb:1 ';
const importLineSeparator = /\r\n?|\n|\u2028|\u2029/u;
const verbImportFields = line => line.replace(/(?<!\\)\\\s*$/u, '').split('|').map(field => field.trim());
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
const impersonalExample = 'man muss | falloir | fall- | avoir | fallu | — | — | il faut | — | — | —';
const weatherExample = 'regnen | pleuvoir | pleuv- | avoir | plu | — | — | il pleut | — | — | —';

export const frenchVerbPrompt = `Erstelle aus dem hochgeladenen Vokabular eine Liste französischer Verbkarten für Lernkarten Maker. Übernimm die Verben in der Reihenfolge der Vorlage und schreibe eine Zeile pro Verb.

Trenne die elf Felder mit einem senkrechten Strich. Halte diese Reihenfolge ein.
Deutsche Bedeutung | französischer Infinitiv | Imparfait-Stamm | Hilfsverb | Partizip Perfekt | je | tu | il / elle / on | nous | vous | ils / elles

Schreibe zuerst den deutschen Infinitiv oder die natürliche deutsche Entsprechung und danach den französischen Infinitiv. Ins dritte Feld kommt der Imparfait-Stamm mit Bindestrich. Nimm dafür in der Regel die nous-Form im Präsens ohne -ons und ohne Reflexivpronomen: nous tenons → ten-, nous allons → all-, nous fuyons → fuy-. Für être lautet der Stamm ét-, für falloir fall- und für pleuvoir pleuv-. Prüfe den Stamm mit einer Imparfait-Form wie «je tenais» oder «il fallait». Ist der Stamm unsicher, setze — ins dritte Feld. Verwende als Hilfsverb avoir, être oder avoir / être. Gib danach das französische participe passé an.

Schreibe in jedes Präsensfeld das Subjekt und die vollständige Form, z. B. «je lance», «j’aime» oder «je m’inquiète». Stimme Übersetzung, Infinitiv, Hilfsverb und Formen aufeinander ab. Verwende bei «beunruhigen» inquiéter mit avoir und j’inquiète. Verwende bei «sich Sorgen machen» s’inquiéter mit être und je m’inquiète.

Schreibe einen einzelnen Strich «—» in jedes Feld ohne Angabe, damit es auf der Karte leer bleibt. Bei unpersönlichen Verben wie falloir und pleuvoir steht die Form mit «il» im dritten Präsensfeld. Die übrigen Präsensfelder bleiben durch «—» als Lücken markiert. Behalte alle elf Felder und alle zehn senkrechten Striche bei.

Prüfe jede Zeile vor der Ausgabe auf Feldanzahl, vollständige Pronomen und Übereinstimmung von Bedeutung und Verbform. Gib nur die fertigen Zeilen als Klartext aus. Beende jede Zeile mit dem Inhalt des letzten Felds und einem normalen Zeilenumbruch. Nutze die folgenden Zeilen als Formatbeispiele und übernimm für deine Ausgabe die Verben aus meiner Vorlage.

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

    const fields = verbImportFields(line);
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

const specialImparfaitStems = new Map([
  ['être', 'ét-'],
  ['falloir', 'fall-'],
  ['pleuvoir', 'pleuv-'],
]);

function stemForComparison(stem) {
  return stem.normalize('NFC').toLowerCase().replace(/\s*[-‐‑‒–—―−]$/u, '');
}

function comparableImparfaitStem(lemma, stem) {
  const base = stemForComparison(stem);
  // These verbs drop the extra e or cédille before -ions and -iez.
  if (lemma.endsWith('ger') && base.endsWith('ge')) return base.slice(0, -1);
  if (lemma.endsWith('cer') && base.endsWith('ç')) return base.slice(0, -1) + 'c';
  if (/^(?:se |s['’])?r?asseoir$/u.test(lemma)) return base.replace(/assoy$/u, 'assey');
  return base;
}

function getImparfaitEvidence(infinitive, forms) {
  const lemma = infinitive.normalize('NFC').toLowerCase();
  const special = specialImparfaitStems.get(lemma);
  if (special) return { stem: special };

  const nous = forms[3].form.replace(/^nous\s+/iu, '').replace(/^(?:en|y)\s+/iu, '');
  const vous = forms[4].form.replace(/^vous\s+/iu, '').replace(/^(?:en|y)\s+/iu, '');
  const nousStem = nous.match(/^([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)ons$/iu)?.[1];
  const vousStem = vous.match(/^([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)ez$/iu)?.[1];
  if (!nousStem) return { stem: '' };
  if (vousStem && comparableImparfaitStem(lemma, nousStem) !== comparableImparfaitStem(lemma, vousStem)) {
    return { stem: '', conflict: true };
  }
  return { stem: nousStem + '-' };
}

function findImparfaitConflict(verb, evidence) {
  if (evidence.conflict) {
    return { reason: 'Die nous- und vous-Form ergeben unterschiedliche Imparfait-Stämme. Prüfe die beiden Präsensformen.' };
  }
  if (!evidence.stem) return null;
  const lemma = verb.infinitive.normalize('NFC').toLowerCase();
  if (comparableImparfaitStem(lemma, verb.stem) === comparableImparfaitStem(lemma, evidence.stem)) return null;
  return {
    reason: 'Prüfe den Imparfait-Stamm «' + verb.stem + '». Der Vorschlag aus Infinitiv und Präsensformen lautet «' + evidence.stem + '».',
    replacement: { ...verb, stem: evidence.stem },
  };
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

  const imparfaitEvidence = getImparfaitEvidence(infinitive, forms);
  const stem = isGap(rawStem) ? imparfaitEvidence.stem : rawStem;
  return { verb: { infinitive, stem, auxiliary, participle: isGap(participle) ? '' : participle, forms }, imparfaitEvidence };
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
    const [front, ...fields] = verbImportFields(raw);
    if (fields.length !== 10) {
      errors.push({ line, text: raw, reason: 'Eine Verbzeile braucht elf Felder, getrennt durch |.' });
      continue;
    }
    if (isGap(front)) {
      errors.push({ line, text: raw, reason: 'Die deutsche Bedeutung fehlt.' });
      continue;
    }

    const { verb, reason, imparfaitEvidence } = readVerbFields(fields, true);
    if (!verb) {
      errors.push({ line, text: raw, reason });
      continue;
    }
    if (front.normalize('NFC').toLowerCase() === verb.infinitive.normalize('NFC').toLowerCase()) {
      errors.push({ line, text: raw, reason: 'Im ersten Feld steht derselbe Infinitiv wie im zweiten. Trage im ersten Feld die deutsche Bedeutung ein.' });
      continue;
    }
    const conflict = findReflexiveConflict(verb) || findImparfaitConflict(verb, imparfaitEvidence);
    if (conflict) {
      const correction = conflict.replacement && [front, ...verbFields(conflict.replacement)].join(fieldSeparator);
      errors.push({ line, text: raw, reason: conflict.reason, ...(correction && { correction }) });
      continue;
    }

    rows.push({ line, front, back: formatFrenchVerbSide(verb) });
  }

  return { rows, errors };
}
