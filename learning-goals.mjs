const lineSeparator = /\r\n?|\n|\u2028|\u2029/u;
const bulletAtStart = /^•/u;
const alternateListLine = /^(?:[●▪◦‣]\s*|[-*–—]\s+)(.+)$/u;

function answerFromLine(line) {
  const separator = line.indexOf('=');
  return separator === -1 ? '' : line.slice(separator + 1).trim();
}

export function parseLearningGoalBullets(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const lines = text.split(lineSeparator).map(line => line.trim()).filter(Boolean);
  // A manually edited answer must mark every line, so prose and calculations
  // with unmarked lines keep their ordinary text rendering.
  const groups = lines.map(line => {
    const body = bulletAtStart.test(line) ? line.slice(1) :
      (lines.length > 1 ? line.match(alternateListLine)?.[1] : '');
    return (body || '').split('•').map(item => item.trim());
  });
  return groups.every(items => items.every(Boolean)) ? groups.flat() : null;
}

export function formatLearningGoalBullets(items) {
  return items.map(item => `• ${item}`).join('\n');
}

export function detectLearningGoalImport(text) {
  return String(text ?? '').split(lineSeparator).some(line => bulletAtStart.test(answerFromLine(line)));
}

export function parseLearningGoalImport(text, parseVocabulary, { requireBullets = true } = {}) {
  const lines = String(text ?? '').split(lineSeparator);
  const parsed = parseVocabulary(text);
  const errors = [...parsed.errors];
  const rows = parsed.rows.flatMap(row => {
    const raw = lines[row.line - 1];
    const answer = answerFromLine(raw);
    const explicitBullets = bulletAtStart.test(answer);
    if (!explicitBullets && !requireBullets) return [row];

    const items = parseLearningGoalBullets(answer);
    if (!items) {
      const reason = explicitBullets
        ? 'Schreibe nach jedem «•» einen Stichpunkt und entferne leere Punkte.'
        : 'Beginne die Antwort mit «•» und setze vor jeden weiteren Stichpunkt ein «•».';
      errors.push({ line: row.line, text: raw, reason });
      return [];
    }

    // Double parentheses can be part of a subject answer. Only ordinary
    // vocabulary cards interpret them as the separate example-sentence field.
    const card = { ...row, back: formatLearningGoalBullets(items), requireBullets: true };
    delete card.backExampleSentence;
    return [card];
  });
  return { rows, errors: errors.sort((a, b) => a.line - b.line) };
}
