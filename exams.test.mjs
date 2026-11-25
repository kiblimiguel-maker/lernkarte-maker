import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { examDateStatus, examSets, isExam, sortedExams, validateExamInput } from './exams.mjs';
import { renderExamsPage, renderExamDetail } from './exam-view.mjs';
import { toLibraryRows } from './repository-core.mjs';
const { normalizeLibrary } = createRequire(import.meta.url)('./model.js');

const exam = { id: 'exam', subjectId: 'fr', name: 'Verben', kind: 'exam', examDate: '2026-11-25', examSetIds: ['linked', 'direct', 'linked', 'missing', 'foreign'] };
const library = {
  subjects: [{ id: 'fr', name: 'Französisch' }, { id: 'bio', name: 'Biologie' }],
  folders: [exam, { id: 'child', subjectId: 'fr', parentId: 'exam' }, { id: 'deep', subjectId: 'fr', parentId: 'child' }, { id: 'bad-parent', subjectId: 'bio', parentId: 'exam' }],
  sets: [
    { id: 'linked', subjectId: 'fr', folderId: 'outside' },
    { id: 'direct', subjectId: 'fr', folderId: 'exam' },
    { id: 'nested', subjectId: 'fr', folderId: 'deep' },
    { id: 'unselected', subjectId: 'fr', folderId: 'outside' },
    { id: 'foreign', subjectId: 'bio', folderId: 'bad-parent' }
  ]
};
const original = structuredClone(library);
assert.equal(isExam(exam), true);
assert.equal(isExam({ kind: 'folder' }), false);
assert.equal(isExam(null), false);
assert.deepEqual(examSets(library, exam).map(set => set.id), ['linked', 'direct', 'nested']);
assert.equal(examSets(library, exam)[0], library.sets[0], 'links retain existing cards and learning state');
assert.deepEqual(examSets(library, { kind: 'folder', id: 'exam', subjectId: 'fr' }), []);
assert.deepEqual(examSets({}, exam), []);
assert.deepEqual(library, original, 'collecting exam material must not move or copy any original');

const cyclic = structuredClone(library);
cyclic.folders[1].parentId = 'deep';
cyclic.folders[2].parentId = 'child';
assert.deepEqual(examSets(cyclic, exam).map(set => set.id), ['linked', 'direct'], 'parent cycles terminate and do not include an unrelated branch');
const rootCycle = structuredClone(library);
rootCycle.folders[0].parentId = 'deep';
assert.deepEqual(examSets(rootCycle, rootCycle.folders[0]).map(set => set.id), ['linked', 'direct', 'nested']);

assert.deepEqual(examDateStatus('2026-11-24', new Date(2026, 10, 24, 23, 59)), { label: 'Heute', state: 'today', days: 0 });
assert.deepEqual(examDateStatus('2026-11-25', '2026-11-24'), { label: 'Morgen', state: 'upcoming', days: 1 });
assert.deepEqual(examDateStatus('2026-11-23', '2026-11-24'), { label: 'Gestern', state: 'past', days: -1 });
assert.equal(examDateStatus('2026-11-29', '2026-11-24').label, 'In 5 Tagen');
assert.equal(examDateStatus('2026-11-19', '2026-11-24').label, 'Vor 5 Tagen');
assert.equal(examDateStatus('2026-03-30', new Date(2026, 2, 28, 23, 30)).days, 2, 'spring DST does not shorten a calendar day');
assert.equal(examDateStatus('2026-10-26', new Date(2026, 9, 24, 23, 30)).days, 2, 'autumn DST does not lengthen a calendar day');
assert.equal(examDateStatus('2028-02-29', '2028-02-28').days, 1, 'leap day is accepted');
for (const value of ['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-01-00', '0000-01-01', '24.11.2026', '2026-11-24T00:00:00Z']) assert.equal(examDateStatus(value).state, 'invalid', value);
assert.equal(examDateStatus('2026-11-24', new Date('invalid')).state, 'invalid');

const future = { ...exam, id: 'future', examDate: '2026-11-30' };
const today = { ...exam, id: 'today', examDate: '2026-11-24' };
const older = { ...exam, id: 'older', examDate: '2026-11-01' };
const yesterday = { ...exam, id: 'yesterday', examDate: '2026-11-23' };
const invalid = { ...exam, id: 'invalid', examDate: 'nonsense' };
const sorting = { folders: [older, future, yesterday, invalid, today, exam, { id: 'folder', subjectId: 'fr' }, { ...exam, id: 'bio-exam', subjectId: 'bio' }] };
assert.deepEqual(sortedExams(sorting, { subjectId: 'fr', today: '2026-11-24' }).map(item => item.id), ['today', 'exam', 'future', 'yesterday', 'older', 'invalid']);
assert.equal(sortedExams(sorting, { today: '2026-11-24' }).length, 7);
assert.deepEqual(sorting.folders.map(item => item.id), ['older', 'future', 'yesterday', 'invalid', 'today', 'exam', 'folder', 'bio-exam'], 'sorting never mutates persistent order');

const input = { name: ' Verben-Test ', subjectId: 'fr', examDate: '2026-11-25', examNotes: ' Kapitel 1–3 ', examLinks: [{ id: 'notes', title: ' Schulunterlagen ', url: ' https://example.org/unterricht ' }], examSetIds: ['linked', 'direct', 'linked'] };
const saved = validateExamInput(input, library);
assert.equal(saved.error, null);
assert.deepEqual(saved.value, { name: 'Verben-Test', subjectId: 'fr', parentId: null, kind: 'exam', examDate: '2026-11-25', examNotes: 'Kapitel 1–3', examLinks: [{ id: 'notes', title: 'Schulunterlagen', url: 'https://example.org/unterricht' }], examSetIds: ['linked', 'direct'] });
assert.equal(input.name, ' Verben-Test ', 'validation leaves original input untouched');
assert.equal(validateExamInput({ name: 'Test', subjectId: 'fr', examDate: '2028-02-29' }, library).error, null);
assert.equal(validateExamInput({ ...input, examDate: '2000-01-01' }, library).error, null, 'past tests may be kept and edited');
assert.equal(validateExamInput({ ...input, examLinks: [{ url: 'https://example.org' }] }, library).value.examLinks[0].title, 'example.org');
for (const patch of [
  { name: '' }, { name: 'a'.repeat(101) }, { subjectId: 'absent' }, { examDate: '2026-02-29' },
  { examNotes: 'a'.repeat(20_001) }, { examNotes: {} }, { examLinks: {} }, { examSetIds: 'linked' },
  { examSetIds: ['foreign'] }, { examSetIds: ['missing'] }, { examSetIds: [null] },
  { examLinks: [{ url: 'javascript:alert(1)' }] }, { examLinks: [{ url: 'data:text/html,unsafe' }] },
  { examLinks: [{ url: '/relative-path' }] }, { examLinks: [{ url: 'https://user:secret@example.org' }] },
  { examLinks: [{ title: 'x'.repeat(101), url: 'https://example.org' }] },
  { examLinks: [{ url: 'https://example.org/' + 'x'.repeat(2048) }] },
  { examLinks: Array.from({ length: 51 }, (_, index) => ({ id: String(index), url: 'https://example.org' })) },
  { examLinks: [{ id: 'same', url: 'https://one.example' }, { id: 'same', url: 'https://two.example' }] }
]) {
  const result = validateExamInput({ ...input, ...patch }, library);
  assert.equal(result.value, null, JSON.stringify(patch).slice(0, 100));
  assert.ok(result.error);
}
assert.deepEqual(library, original, 'validation preserves linked originals and the library');
const savedExam={id:'saved',...saved.value,position:2};
const stored=normalizeLibrary({...library,folders:[savedExam],cards:[]});
const rows=toLibraryRows('folders',stored,'owner');
assert.equal(rows[0].user_id,'owner');assert.equal(rows[0].subject_id,'fr');
const loaded=normalizeLibrary({...library,folders:rows.map(row=>JSON.parse(JSON.stringify(row.data))),cards:[]});
assert.deepEqual(loaded.folders[0].examLinks,saved.value.examLinks);
assert.deepEqual(loaded.folders[0].examSetIds,saved.value.examSetIds);
assert.equal(loaded.folders[0].examDate,'2026-11-25');
assert.equal(loaded.folders[0].kind,'exam','existing folder persistence keeps the test subtype');
const unsafe={...savedExam,name:'<img src=x onerror=alert(1)>',examNotes:'<script>unsafe</script>',examLinks:[{url:'javascript:alert(1)'},{url:'https://user:secret@example.org'}]};
const detail=renderExamDetail({exam:unsafe,subject:library.subjects[0]});
assert.ok(detail.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
assert.ok(!detail.includes('href="javascript:'));assert.ok(!detail.includes('user:secret'));
assert.ok(!detail.includes('<img src=x'));
assert.ok(renderExamsPage({library,exams:[unsafe]}).includes('&lt;img src=x'));
for (const color of ['#91BB63', '#FFFFFF', '#000000']) {
  const markup=renderExamsPage({library,exams:[savedExam],subjects:[{id:savedExam.subjectId,name:'Fach',color}]});
  assert.ok(markup.includes(`--exam-subject-color:${color}`));
}
for (const color of [undefined, '#fff; background: url(https://invalid.example)', '"><img src=x onerror=alert(1)>']) {
  const markup=renderExamsPage({library,exams:[savedExam],subjects:[{id:savedExam.subjectId,name:'Fach',color}]});
  assert.ok(markup.includes('--exam-subject-color:var(--accent)'));
  assert.ok(!markup.includes('<img src=x')&&!markup.includes('url(https://invalid.example)'),'malformed subject colours cannot inject HTML or CSS');
}
console.log('Exam model checks passed: valid dates, local calendar boundaries, safe links, independent material references, nested/cyclic folders and stable sorting.');
