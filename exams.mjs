const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
const text = value => typeof value === 'string' ? value.trim() : '';

export const isExam = folder => Boolean(folder && typeof folder === 'object' && folder.kind === 'exam');

// Calendar ordinals avoid both DST-length days and UTC shifts of a local date.
function calendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getTime() / 86_400_000 : null;
}

function todayDay(today) {
  if (typeof today === 'string') return calendarDay(today);
  if (!(today instanceof Date) || !Number.isFinite(today.getTime())) return null;
  return calendarDay(`${String(today.getFullYear()).padStart(4, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
}

export function examDateStatus(value, today = new Date()) {
  const date = calendarDay(value), current = todayDay(today);
  if (date === null || current === null) return { label: 'Datum fehlt', state: 'invalid', days: null };
  const days = date - current;
  return {
    days,
    state: days === 0 ? 'today' : days > 0 ? 'upcoming' : 'past',
    label: days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days === -1 ? 'Gestern' : days > 0 ? `In ${days} Tagen` : `Vor ${-days} Tagen`
  };
}

export function sortedExams(library, { subjectId = null, today = new Date() } = {}) {
  return records(library?.folders).filter(folder => isExam(folder) && (!subjectId || folder.subjectId === subjectId))
    .map((item, index) => ({ item, index, days: examDateStatus(item.examDate, today).days }))
    .sort((left, right) => {
      const group = days => days === null ? 2 : days < 0 ? 1 : 0;
      const section = group(left.days) - group(right.days);
      if (section) return section;
      if (left.days !== null && right.days !== null) {
        const order = left.days < 0 ? right.days - left.days : left.days - right.days;
        if (order) return order;
      }
      return left.index - right.index;
    }).map(({ item }) => item);
}

export function examSets(library, exam) {
  if (!isExam(exam) || !exam.id || !exam.subjectId) return [];
  const available = new Map(records(library?.sets).map(set => [set.id, set]));
  const result = [], included = new Set();
  const add = id => {
    if (!included.has(id) && available.has(id)) {
      included.add(id);
      result.push(available.get(id));
    }
  };
  // Explicit links refer only to the current user's loaded library. They stay
  // linked after a test changes subject, without moving their original decks.
  for (const id of Array.isArray(exam.examSetIds) ? exam.examSetIds : []) add(id);

  const children = new Map();
  for (const folder of records(library?.folders)) {
    if (folder.subjectId !== exam.subjectId || !folder.parentId) continue;
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  }
  const within = new Set([exam.id]), queue = [exam.id];
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]) || []) {
      if (within.has(child)) continue;
      within.add(child);
      queue.push(child);
    }
  }
  for (const set of available.values()) if (set.subjectId === exam.subjectId && within.has(set.folderId)) add(set.id);
  return result;
}

// Build an isolated organisation plan using the same validated folder move as
// drag and drop. The caller persists its location changes atomically before
// adopting the new records; cards, sessions and referenced decks are untouched.
export function planExamSubjectChange(library, examId, subjectId, libraryModel, timestamp) {
  const fail = error => ({ value: null, changed: false, error });
  const exam = records(library?.folders).find(item => item.id === examId);
  if (!isExam(exam)) return fail('Dieser Test ist nicht mehr vorhanden. Bitte öffne ihn erneut.');
  if (!records(library?.subjects).some(item => item.id === subjectId)) return fail('Wähle ein vorhandenes Fach aus.');
  if (exam.subjectId === subjectId) return { value: library, changed: false, error: null };
  if (typeof libraryModel?.canMoveLibraryItem !== 'function' || typeof libraryModel?.moveLibraryItem !== 'function') {
    return fail('Das Fach kann gerade nicht gewechselt werden. Bitte lade die App neu.');
  }
  const options = { type: 'folder', id: examId, subjectId, folderId: null, timestamp };
  if (!libraryModel.canMoveLibraryItem(library, options)) {
    return fail('Die Testunterlagen können nicht sicher in dieses Fach verschoben werden. Bitte lade deine Bibliothek neu.');
  }
  const cloneRecords = collection => (Array.isArray(collection) ? collection : []).map(item =>
    item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : item);
  const value = { ...library, folders: cloneRecords(library.folders), sets: cloneRecords(library.sets) };
  if (!libraryModel.moveLibraryItem(value, options)) return fail('Das Fach konnte nicht gewechselt werden. Bitte versuche es erneut.');
  return { value, changed: true, error: null };
}

export function validateExamInput(input, library) {
  const fail = error => ({ value: null, error });
  if (!input || typeof input !== 'object') return fail('Bitte ergänze die Angaben zum Test.');
  const name = text(input.name), subjectId = text(input.subjectId), examDate = text(input.examDate);
  if (!name || name.length > 100) return fail('Gib einen Testnamen mit höchstens 100 Zeichen ein.');
  if (!records(library?.subjects).some(subject => subject.id === subjectId)) return fail('Wähle ein vorhandenes Fach aus.');
  if (calendarDay(examDate) === null) return fail('Gib ein gültiges Datum für den Test ein.');
  if (input.examNotes != null && typeof input.examNotes !== 'string') return fail('Gib deine Notizen als Text ein.');
  const examNotes = text(input.examNotes);
  if (examNotes.length > 20_000) return fail('Die Notizen dürfen höchstens 20’000 Zeichen enthalten.');

  if (input.examLinks != null && !Array.isArray(input.examLinks)) return fail('Prüfe die Links zu deinen Lernunterlagen.');
  const links = input.examLinks || [];
  if (links.length > 50) return fail('Du kannst pro Test höchstens 50 Links speichern.');
  const examLinks = [], linkIds = new Set();
  for (const link of links) {
    if (!link || typeof link !== 'object') return fail('Prüfe die Links zu deinen Lernunterlagen.');
    const title = text(link.title), url = text(link.url);
    if (title.length > 100 || url.length > 2048) return fail('Linktitel dürfen höchstens 100 und Linkadressen höchstens 2’048 Zeichen enthalten.');
    let parsed;
    try { parsed = new URL(url); } catch { return fail('Verwende für Links eine vollständige Adresse mit https:// oder http://.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return fail('Verwende ausschliesslich Weblinks mit https:// oder http:// ohne Zugangsdaten in der Adresse.');
    const id = text(link.id) || parsed.href;
    if (linkIds.has(id)) return fail('Jeder Link muss eine eigene Kennung haben.');
    linkIds.add(id);
    examLinks.push({ id, title: title || parsed.hostname, url: parsed.href });
  }

  if (input.examSetIds != null && !Array.isArray(input.examSetIds)) return fail('Wähle die Lernstapel über die Liste aus.');
  const sets = new Set(records(library?.sets).map(set => set.id));
  const examSetIds = [];
  for (const id of input.examSetIds || []) {
    if (typeof id !== 'string' || !sets.has(id)) return fail('Ein ausgewählter Lernstapel ist nicht mehr in deiner Bibliothek vorhanden. Bitte wähle ihn erneut aus.');
    if (!examSetIds.includes(id)) examSetIds.push(id);
  }
  return { value: { name, subjectId, parentId: null, kind: 'exam', examDate, examNotes, examLinks, examSetIds }, error: null };
}
