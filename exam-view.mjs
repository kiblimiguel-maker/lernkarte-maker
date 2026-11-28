import { examDateStatus, examSets } from './exams.mjs';

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const subjectColor = subject => typeof subject?.color === 'string' && /^#[0-9a-f]{6}$/i.test(subject.color) ? subject.color : 'var(--accent)';

export function examIcon(size = 20) {
  const dimension = Number.isFinite(size) ? Math.max(12, Math.min(64, size)) : 20;
  return `<svg viewBox="0 0 24 24" width="${dimension}" height="${dimension}" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1.5"/><path d="m8 13 2.5 2.5L16 10"/></svg>`;
}

const calendarIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></svg>';
const editIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l4.5-1 12-12a1.6 1.6 0 0 0 0-2.3l-1.7-1.7a1.6 1.6 0 0 0-2.3 0l-12 12L4 20Z"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6m4-6v6"/></svg>';
const linkIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 13 4-4m-6 7-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m4-1 2-2a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" transform="translate(1 0)"/></svg>';

function dateText(value, today) {
  if (examDateStatus(value, today).state === 'invalid') return 'Datum fehlt';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function statusMarkup(exam, today) {
  const status = examDateStatus(exam.examDate, today);
  return `<span class="exam-date-badge" data-state="${escapeText(status.state)}">${escapeText(status.label)}</span>`;
}

function safeLinks(exam) {
  return (Array.isArray(exam.examLinks) ? exam.examLinks : []).flatMap(link => {
    if (!link || typeof link !== 'object') return [];
    try {
      const url = new URL(link.url);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? [{ ...link, url: url.href, title: String(link.title || url.hostname) }] : [];
    } catch { return []; }
  });
}

function examCard(library, exam, subjects, today) {
  const subject = subjects.get(exam.subjectId);
  const sets = examSets(library, exam);
  const links = safeLinks(exam);
  const extra = links.length + (String(exam.examNotes || '').trim() ? 1 : 0);
  return `<article class="exam-card" style="--exam-subject-color:${subjectColor(subject)}">
    <button type="button" class="exam-card-open" data-exam-open="${escapeText(exam.id)}" aria-label="${escapeText(exam.name)} öffnen">
      <span class="exam-card-top"><span class="exam-symbol">${examIcon(25)}</span>${statusMarkup(exam, today)}</span>
      <span class="exam-card-subject">${escapeText(subject?.name || 'Ohne Fach')}</span>
      <span class="exam-card-title">${escapeText(exam.name)}</span>
      <span class="exam-card-date">${calendarIcon}<time datetime="${escapeText(exam.examDate)}">${escapeText(dateText(exam.examDate, today))}</time></span>
    </button>
    <div class="exam-card-footer">
      <span class="exam-card-summary">${sets.length} ${sets.length === 1 ? 'Lernstapel' : 'Lernstapel'}${extra ? ` · ${extra} ${extra === 1 ? 'weitere Unterlage' : 'weitere Unterlagen'}` : ''}</span>
      <span class="exam-card-actions"><button type="button" class="icon-button" data-exam-edit="${escapeText(exam.id)}" aria-label="${escapeText(exam.name)} bearbeiten" title="Test bearbeiten">${editIcon}</button><button type="button" class="icon-button exam-delete-action" data-exam-delete="${escapeText(exam.id)}" aria-label="${escapeText(exam.name)} löschen" title="Test löschen">${deleteIcon}</button></span>
    </div>
  </article>`;
}

export function renderExamsPage({ library, exams = [], subjects = library.subjects, subjectId = '', today = new Date() }) {
  const bySubject = new Map(subjects.map(subject => [subject.id, subject]));
  const current = exams.filter(exam => !subjectId || exam.subjectId === subjectId);
  const forthcoming = current.filter(exam => examDateStatus(exam.examDate, today).state !== 'past');
  const past = current.filter(exam => examDateStatus(exam.examDate, today).state === 'past');
  const section = (title, items, className = '') => items.length ? `<section class="library-section ${className}"><div class="section-head"><h2>${title}<span class="count-label">${items.length}</span></h2></div><div class="exam-grid">${items.map(exam => examCard(library, exam, bySubject, today)).join('')}</div></section>` : '';
  return `<section class="exams-page" aria-labelledby="exams-title">
    <header class="page-heading"><div><h1 class="page-title" id="exams-title">Tests</h1><p class="page-subtitle">Deine Testtermine und die passenden Lernunterlagen an einem Ort.</p></div><div class="page-primary-actions"><button type="button" class="primary-button" data-exam-create>${examIcon(17)} ${subjects.length?'Test anlegen':'Fach anlegen'}</button></div></header>
    ${subjects.length ? `<div class="exam-filter"><div class="exam-filter-field"><label for="exam-subject-filter">Fach</label><span class="exam-filter-control"><select id="exam-subject-filter" data-exam-subject-filter><option value="">Alle Fächer</option>${subjects.map(subject => `<option value="${escapeText(subject.id)}"${subjectId === subject.id ? ' selected' : ''}>${escapeText(subject.name)}</option>`).join('')}</select><svg class="exam-filter-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span></div><span class="exam-filter-count" role="status">${current.length} ${current.length === 1 ? 'Test' : 'Tests'}</span></div>` : ''}
    ${!current.length ? `<section class="empty-state exam-empty"><span class="exam-symbol" aria-hidden="true">${examIcon(26)}</span><h2>${exams.length ? 'Für dieses Fach gibt es noch keinen Test' : 'Dein nächster Test beginnt hier'}</h2><p>${subjects.length?'Wähle ein Fach und das Testdatum. Danach kannst du Lernstapel, Notizen und Links für die Vorbereitung sammeln.':'Lege zuerst ein Fach an. Danach kannst du Testtermine und die passenden Lernunterlagen sammeln.'}</p><button type="button" class="quiet-button" data-exam-create>${subjects.length?'Test anlegen':'Fach anlegen'}</button></section>` : section('Bevorstehende Tests', forthcoming) + section('Vergangene Tests', past, 'exam-past-section')}
  </section>`;
}

export function renderExamDetail({ exam, subject, missedCount = 0, orderingMarkup = '', setsMarkup = '', sets = [], today = new Date(), materialsMarkup = '' }) {
  const links = safeLinks(exam);
  const notes = String(exam.examNotes || '').trim();
  return `<section class="exam-detail" aria-labelledby="exam-title" style="--exam-subject-color:${subjectColor(subject)}">
    <header class="subpage-heading exam-detail-heading">
      <button type="button" class="back-button" data-exam-back aria-label="Zurück zu Tests" title="Zurück zu Tests"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 6-6 6 6 6M7 12h12"/></svg></button>
      <div class="subject-heading"><span class="exam-symbol">${examIcon(27)}</span><div><div class="page-context">Test · ${escapeText(subject?.name || 'Ohne Fach')}</div><h1 class="page-title" id="exam-title">${escapeText(exam.name)}</h1><p class="page-subtitle"><time datetime="${escapeText(exam.examDate)}">${escapeText(dateText(exam.examDate, today))}</time></p><div class="exam-detail-status">${statusMarkup(exam, today)}</div></div></div>
      <div class="library-detail-actions">${sets.length ? `<button type="button" class="primary-button" data-exam-practice ${missedCount ? '' : 'disabled'} title="Zuletzt falsch beantwortete Karten aus den Lernstapeln dieses Tests">Unsichere Karten üben (${missedCount})</button>` : ''}<button type="button" class="quiet-button" data-share-kind="exam" data-item-id="${escapeText(exam.id)}" aria-haspopup="dialog">${linkIcon} Teilen</button><details class="management-menu"><summary>Verwalten <span class="management-chevron" aria-hidden="true"></span></summary><div class="management-menu-panel"><button type="button" data-exam-edit="${escapeText(exam.id)}">Test bearbeiten</button><button type="button" class="danger-action" data-exam-delete="${escapeText(exam.id)}">Test löschen</button></div></details></div>
    </header>
    <section class="library-section" aria-labelledby="exam-study-title"><div class="section-head exam-material-heading"><h2 id="exam-study-title">Lernstapel<span class="count-label">${sets.length}</span></h2><div class="section-actions">${orderingMarkup}<button type="button" class="quiet-button" data-exam-materials>Unterlagen verwalten</button><button type="button" class="primary-button" data-exam-new-set>＋ Lernstapel erstellen</button></div></div>
      ${setsMarkup ? `<div class="set-grid">${setsMarkup}</div>` : '<div class="empty-state exam-sets-empty"><h2>Deine Vorbereitung ist noch leer</h2><p>Ordne vorhandene Lernstapel zu oder erstelle einen neuen Stapel für diesen Test.</p></div>'}
    </section>
    <div class="exam-material-grid">
      <section class="exam-material-panel" aria-labelledby="exam-notes-title"><h2 id="exam-notes-title">Notizen & Lernziele</h2>${notes ? `<p class="exam-notes">${escapeText(notes)}</p>` : '<p class="exam-material-empty">Halte hier Themen, Lernziele und wichtige Hinweise für den Test fest.</p>'}</section>
      <section class="exam-material-panel" aria-labelledby="exam-links-title"><h2 id="exam-links-title">Links<span class="count-label">${links.length}</span></h2>${links.length ? `<ul class="exam-links">${links.map(link => `<li><a href="${escapeText(link.url)}" target="_blank" rel="noopener noreferrer">${linkIcon}<span><strong>${escapeText(link.title)}</strong><small>${escapeText(new URL(link.url).hostname)}</small></span><span aria-hidden="true">↗</span></a></li>`).join('')}</ul>` : '<p class="exam-material-empty">Ergänze Webseiten oder Online-Unterlagen für deine Vorbereitung.</p>'}</section>
    </div>
    ${materialsMarkup}
  </section>`;
}
