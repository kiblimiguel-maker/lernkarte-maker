/**
 * Optional Tests-area browser regressions. Runs a local Vite fixture with all
 * external traffic mocked; Google OAuth and production accounts are never used.
 * PLAYWRIGHT_MODULE=/path/to/playwright node scripts/exams-browser.test.mjs
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE, QA_ENGINES=chromium.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { throw new Error('Browserprüfung benötigt ein separat installiertes Playwright. Setze PLAYWRIGHT_MODULE auf dessen Modulpfad.'); }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = process.env.QA_BACKEND_ORIGIN || 'https://exam-fixture.supabase.invalid';
const storageKey=`sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
const user = { id: '212c8ce0-d613-4864-a588-98da450ca3e3', email: 'exam-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = {
  user, access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: 'authenticated' })).toString('base64url')}.c2ln`,
  refresh_token: 'fixture', expires_in: 3600, expires_at: expires, token_type: 'bearer'
};
const fixture = {
  subjects: [
    { id: 'fr', name: 'Französisch', color: '#7D9DBD', emoji: '🇫🇷', position: 0 },
    { id: 'bio', name: 'Biologie', color: '#86A48B', emoji: '🧬', position: 1 }
  ],
  folders: [{ id: 'unit', subjectId: 'fr', name: 'Unterricht', parentId: null, position: 0, color: '#7D9DBD' }],
  sets: [
    { id: 'vocab', subjectId: 'fr', folderId: 'unit', name: 'Vokabeln', position: 0 },
    { id: 'extra', subjectId: 'fr', folderId: null, name: 'Weitere Karten', position: 1 },
    { id: 'cell', subjectId: 'bio', folderId: null, name: 'Zellbiologie', position: 0 }
  ],
  cards: [
    { id: 'card-home', setId: 'vocab', front: 'das Haus', back: 'la maison', position: 0, correctCount: 0, incorrectCount: 0 },
    { id: 'card-word', setId: 'extra', front: 'das Wort', back: 'le mot', position: 0, correctCount: 0, incorrectCount: 0 },
    { id: 'card-cell', setId: 'cell', front: 'Zellkern', back: 'Enthält Erbinformation', position: 0, correctCount: 0, incorrectCount: 0 }
  ],
  study_sessions: [], study_history: []
};
const toRow = data => ({ id: data.id, user_id: user.id, data, ...(data.subjectId && { subject_id: data.subjectId }), ...(data.folderId && { folder_id: data.folderId }), ...(data.setId && { set_id: data.setId }) });
const json = body => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' }, body: JSON.stringify(body) });

async function startServer() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [resolve(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: repo, env: { ...process.env, VITE_SUPABASE_URL: backend, VITE_SUPABASE_ANON_KEY: 'isolated-browser-fixture-only', VITE_SUPABASE_PUBLISHABLE_KEY: 'isolated-browser-fixture-only' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let startup = '';
  child.stdout.on('data', chunk => { startup = (startup + chunk).slice(-2000); });
  child.stderr.on('data', chunk => { startup = (startup + chunk).slice(-2000); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Lokale Testvorschau konnte nicht starten: ${startup}`);
    try { if ((await fetch(origin)).ok) return { child, origin }; } catch { /* Server is starting. */ }
    await delay(100);
  }
  child.kill();
  throw new Error(`Lokale Testvorschau ist nicht erreichbar: ${startup}`);
}

async function setup(browser, origin, viewport, reduced, colorScheme) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800, colorScheme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const db = Object.fromEntries(Object.entries(fixture).map(([table, records]) => [table, new Map(records.map(data => [data.id, toRow(structuredClone(data))]))]));
  const errors = [], unexpected = [];
  let failFolderWrite = false, failOrganisationWrite = false;
  await context.addInitScript(({session,storageKey}) => {
    localStorage.setItem(storageKey, JSON.stringify(session));
    localStorage.setItem('wortwerk-donation-reminder-enabled-v1', 'false');
    localStorage.setItem('lernkarten-appearance-v1', 'system');
  }, {session,storageKey});
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith('/_vercel/')) return route.fulfill({status:200,body:''});
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'va.vercel-scripts.com') return route.fulfill({ status: 200, body: '' });
    if (url.origin !== backend) { unexpected.push(`${url.origin}${url.pathname}`); return route.abort(); }
    if (request.method() === 'OPTIONS') return route.fulfill(json(null));
    if (url.pathname === '/auth/v1/user') return route.fulfill(json(user));
    if (url.pathname === '/rest/v1/rpc/organise_library') {
      if(failOrganisationWrite){failOrganisationWrite=false;return route.fulfill({...json({message:'Isolated move failure'}),status:500});}
      const {p_changes}=request.postDataJSON();
      for(const [table,changes] of Object.entries(p_changes))for(const change of changes){const current=db[table].get(change.id);const row={...current,data:{...current.data,...change}};if(change.subjectId)row.subject_id=change.subjectId;if(table==='sets')row.folder_id=change.folderId||null;db[table].set(row.id,row);}
      return route.fulfill(json(null));
    }
    if (url.pathname === '/rest/v1/rpc/save_library_organisation_rows') {
      const { p_table, p_rows } = request.postDataJSON();
      if (p_table === 'folders' && failFolderWrite) { failFolderWrite=false;return route.fulfill({ ...json({message:'Isolated save failure'}),status:500 }); }
      assert.ok(db[p_table], 'Unbekannte Tabelle in der isolierten Speicherung');
      for (const { row } of p_rows) db[p_table].set(row.id, row);
      return route.fulfill(json(null));
    }
    const table = url.pathname.split('/').at(-1);
    if (!db[table]) { unexpected.push(url.pathname); return route.fulfill({ ...json({ message: 'Unknown fixture endpoint' }), status: 404 }); }
    if (request.method() === 'POST') {
      if (table === 'folders' && failFolderWrite) { failFolderWrite=false;return route.fulfill({ ...json({message:'Isolated save failure'}),status:500 }); }
      const rows = request.postDataJSON();
      for (const row of Array.isArray(rows) ? rows : [rows]) db[table].set(row.id, row);
      return route.fulfill(json(null));
    }
    if (request.method() === 'DELETE') {
      const ids = (url.searchParams.get('id') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',');
      ids.forEach(id => db[table].delete(id));
      return route.fulfill(json(null));
    }
    const cursor = url.searchParams.get('id')?.replace(/^gt\./, ''), offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 500);
    const rows = [...db[table].values()].filter(row => !cursor || row.id > cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit);
    return route.fulfill({ ...json(rows), headers: { ...json(rows).headers, 'content-range': rows.length ? `0-${rows.length - 1}/*` : '*/*' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Bibliothek', exact: true }).waitFor();
  return { page, context, errors, unexpected, db, rejectFolderOnce:()=>{failFolderWrite=true;}, rejectOrganisationOnce:()=>{failOrganisationWrite=true;} };
}

async function verifyExams(browser,origin,engine,viewport,reduced,colorScheme){
  const {page,context,errors,unexpected,db,rejectFolderOnce,rejectOrganisationOnce}=await setup(browser,origin,viewport,reduced,colorScheme);
  const testsNav=async()=>{if(viewport.width<=760)await page.locator('#navigation-toggle').click();await page.locator('[data-view="tests"]').click();};
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const screenshot=async name=>{if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,`exams-${engine}-${viewport.width}-${name}.png`),fullPage:true,animations:'disabled'});}};
  try{
    assert.equal(await page.locator('[data-view="recent"]').count(),0);
    await testsNav();await page.locator('[data-exam-create]').first().click();
    assert.equal(await page.locator('#exam-name').inputValue(),'','New tests start without a suggested name.');
    const subjectBounds=await page.locator('#exam-subject').boundingBox();
    const dateBounds=await page.locator('#exam-date').boundingBox();
    assert.ok(subjectBounds&&subjectBounds.height>=40,'The subject selector keeps a full-sized touch target, including WebKit.');
    assert.ok(dateBounds&&dateBounds.height>=40&&Math.abs(subjectBounds.height-dateBounds.height)<=4,'Subject and date controls use consistent heights.');
    await screenshot('create');
    await page.locator('#exam-subject').selectOption('bio');
    assert.equal(await page.locator('#exam-name').inputValue(),'','Changing subject must not fill a test name.');
    await page.locator('#exam-subject').selectOption('fr');
    await page.locator('#exam-name').fill('Verben-Test');
    assert.equal(await page.locator('#exam-date').getAttribute('type'),'text','The visible date field supports ordinary keyboard entry.');
    await page.locator('#exam-date').fill('31.02.2027');
    await page.locator('#exam-save').click();
    assert.equal(await page.locator('#exam-dialog').evaluate(dialog=>dialog.open),true);
    assert.equal([...db.folders.values()].some(row=>row.data.kind==='exam'),false,'An impossible date must not be stored.');
    assert.equal(await page.locator('#exam-date').evaluate(input=>input.checkValidity()),false);
    await page.locator('#exam-date').fill('');
    await page.locator('#exam-date').click({position:{x:12,y:20}});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'exam-date','Clicking the text portion must focus keyboard entry.');
    await page.locator('#exam-date').pressSequentially('15.01.2027');
    await page.locator('#exam-date').press('Tab');
    assert.equal(await page.locator('#exam-date').inputValue(),'15.01.2027');
    assert.equal(await page.locator('#exam-date-picker').inputValue(),'2027-01-15');
    await page.locator('input[name="examSetIds"][value="vocab"]').check();
    assert.equal(await page.locator('input[name="examSetIds"][value="cell"]').count(),0,'Other subjects are not selectable.');
    await page.locator('#exam-notes').fill('Kapitel 1–3\nUnregelmässige Verben üben.');
    await page.locator('#exam-add-link').click();
    await page.locator('[data-exam-link-title]').fill('Schulunterlagen');
    await page.locator('[data-exam-link-url]').fill('https://example.org/unterricht');
    rejectFolderOnce();
    await page.locator('#exam-save').click();
    await page.locator('#exam-error:not([hidden])').waitFor();
    assert.equal(await page.locator('#exam-name').inputValue(),'Verben-Test');
    assert.equal(await page.locator('#exam-dialog').evaluate(dialog=>dialog.open),true);
    assert.equal(await page.locator('#exam-form').evaluate(form=>form.inert),false);
    await page.locator('#exam-save').click();
    await page.locator('#exam-title').waitFor();
    const exam=[...db.folders.values()].find(row=>row.data.kind==='exam');
    assert.ok(exam);assert.equal(exam.user_id,user.id);assert.equal(exam.subject_id,'fr');
    assert.deepEqual(exam.data.examSetIds,['vocab']);
    assert.equal(exam.data.examDate,'2027-01-15');
    assert.equal(db.sets.get('vocab').folder_id,'unit','Associating material never moves the original.');
    assert.equal(await page.locator('[data-open-set="vocab"]').count(),1);
    assert.equal(await page.locator('.exam-notes').textContent(),'Kapitel 1–3\nUnregelmässige Verben üben.');
    assert.equal(await page.locator('.exam-links a').getAttribute('href'),'https://example.org/unterricht');
    await noOverflow();
    const subjectNav=async()=>{if(viewport.width<=760)await page.locator('#navigation-toggle').click();await page.locator('[data-sidebar-subject="fr"]').click();};
    await subjectNav();await page.locator('#add-folder').click();await page.locator('#f-name').fill('Grammatik');
    await page.locator('#form-submit').click();await page.locator('#form-dialog').waitFor({state:'hidden'});await subjectNav();
    await page.locator('[data-toggle-sort]').click();
    assert.equal(await page.locator('.folder-grid > .folder-card').count(),2,'Exam containers do not replace ordinary folders.');
    assert.equal(await page.locator('.folder-grid > .folder-card').first().locator('.sort-position').textContent(),'1 / 2');
    await page.locator('.folder-grid > .folder-card').first().locator('[data-sort-step="1"]').click();
    await page.waitForFunction(()=>document.querySelector('.folder-grid > .folder-card h3')?.textContent==='Grammatik');
    assert.equal(db.folders.get(exam.id).data.kind,'exam');
    assert.equal(db.folders.get(exam.id).data.examDate,'2027-01-15','Folder reordering preserves test metadata.');
    await page.reload();await page.getByRole('heading',{name:'Bibliothek',exact:true}).waitFor();
    await testsNav();await screenshot('list');await page.locator(`[data-exam-open="${exam.id}"]`).click();
    assert.equal(await page.locator('#exam-title').textContent(),'Verben-Test');
    await page.locator('[data-exam-materials]').click();
    assert.equal(await page.locator('#exam-subject').isDisabled(),false);
    assert.equal(await page.locator('#exam-name').inputValue(),'Verben-Test','Editing retains the saved test name.');
    assert.equal(await page.locator('#exam-date').inputValue(),'15.01.2027','Reloaded dates use the local entry format.');
    await page.locator('#exam-name').fill('Verben – aktualisiert');
    await page.locator('#exam-date').fill('31.02.2027');
    await page.locator('#exam-save').click();
    assert.equal(db.folders.get(exam.id).data.examDate,'2027-01-15','Invalid editing must not silently reuse a previously valid date.');
    const calendarBounds=await page.locator('#exam-date-picker').boundingBox();
    assert.ok(calendarBounds&&calendarBounds.width>=40&&calendarBounds.width<=52&&calendarBounds.height>=40,'Calendar keeps a dedicated touch target without covering the typing field.');
    assert.equal(await page.locator('#exam-date-picker').getAttribute('aria-label'),'Datum im Kalender auswählen');
    await page.locator('#exam-date-picker').fill('2027-01-16');
    assert.equal(await page.locator('#exam-date').inputValue(),'16.01.2027','Calendar changes synchronize the typed date.');
    assert.equal(await page.locator('#exam-date').evaluate(input=>input.checkValidity()),true,'Calendar selection clears the manual-date error.');
    await page.locator('input[name="examSetIds"][value="extra"]').check();
    await page.locator('#exam-save').click();await page.locator('#exam-dialog').waitFor({state:'hidden'});await page.locator('#exam-title').waitFor();
    assert.equal(db.folders.get(exam.id).data.examDate,'2027-01-16');
    assert.deepEqual(db.folders.get(exam.id).data.examSetIds,['vocab','extra']);
    await page.locator('[data-quick-study="vocab"]').click();
    await page.locator('#study-dialog[open]').waitFor();
    await page.locator('.study-card-slot.is-active .study-card').click();
    await page.locator('#answer-yes').click();
    await page.locator('#finish-study').click();
    assert.equal(await page.locator('#exam-title').textContent(),'Verben – aktualisiert');
    await page.locator('[data-quick-edit="vocab"]').click();
    await page.getByRole('heading',{name:'Vokabeln',exact:true}).waitFor();
    await page.locator('#go-back').click();
    assert.equal(await page.locator('#exam-title').textContent(),'Verben – aktualisiert');
    await page.locator('[data-exam-new-set]').click();
    assert.equal(await page.locator('#f-folder').inputValue(),exam.id);
    await page.locator('#f-name').fill('Testkarten');await page.locator('#form-submit').click();
    await page.getByRole('heading',{name:'Testkarten',exact:true}).waitFor();
    const created=[...db.sets.values()].find(row=>row.data.name==='Testkarten');
    assert.ok(created);assert.equal(created.folder_id,exam.id);
    await page.locator('#add-card').click();await page.locator('#f-front').fill('gehen');await page.locator('#f-back').fill('aller');
    await page.locator('#form-submit').click();await page.locator('#form-dialog').waitFor({state:'hidden'});
    await page.locator('#go-back').click();await page.locator('#exam-title').waitFor();
    await screenshot('detail');
    await page.locator('[data-exam-materials]').click();
    await page.locator('#exam-subject').selectOption('bio');
    await page.locator('#exam-name').fill('Verben – Fachwechsel');
    assert.equal(await page.locator('input[name="examSetIds"][value="vocab"]').isChecked(),true,'Changing subject keeps selected links.');
    rejectOrganisationOnce();await page.locator('#exam-save').click();await page.locator('#exam-error:not([hidden])').waitFor();
    assert.equal(db.folders.get(exam.id).subject_id,'fr','Failed move retains original location.');
    assert.equal(db.sets.get(created.id).subject_id,'fr');
    rejectFolderOnce();await page.locator('#exam-save').click();
    await page.waitForFunction(()=>document.querySelector('#exam-error').textContent.includes('Das Fach wurde gewechselt.'));
    assert.equal(db.folders.get(exam.id).subject_id,'bio','Successful organisation is retained if later metadata save fails.');
    assert.equal(db.sets.get(created.id).subject_id,'bio');
    assert.equal(db.sets.get('vocab').subject_id,'fr','A referenced deck is not moved.');
    await page.locator('[data-exam-cancel]').last().click();await page.locator('#exam-dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('.exam-detail .page-context').textContent.includes('Biologie'));
    await page.locator('[data-exam-materials]').click();await page.locator('#exam-name').fill('Verben – Fachwechsel');
    await page.locator('#exam-save').click();await page.locator('#exam-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-open-set="vocab"]').count(),1,'Linked material remains visible across subjects.');
    assert.equal(await page.locator(`[data-open-set="${created.id}"]`).count(),1,'Owned material remains visible.');
    const token='a'.repeat(64),frozenExam=structuredClone(db.folders.get(exam.id).data);
    const linkedIds=new Set(frozenExam.examSetIds),sharedSets=[...db.sets.values()].filter(row=>linkedIds.has(row.id)||row.folder_id===exam.id).map(row=>structuredClone(row));
    const sharedSetIds=new Set(sharedSets.map(row=>row.id)),sharedCards=[...db.cards.values()].filter(row=>sharedSetIds.has(row.set_id)).map(row=>structuredClone(row));
    await page.route('**/rest/v1/rpc/create_library_share',async route=>{
      const args=route.request().postDataJSON();assert.equal(args.p_kind,'exam');assert.equal(args.p_id,exam.id);assert.equal(args.p_expected_user,user.id);
      return route.fulfill(json(token));
    });
    await page.route('**/rest/v1/rpc/preview_library_share',async route=>route.fulfill(json({kind:'exam',snapshot:true,title:frozenExam.name,examDate:frozenExam.examDate,folderCount:0,setCount:sharedSets.length,cardCount:sharedCards.length})));
    await page.route('**/rest/v1/rpc/import_library_share',async route=>{
      const args=route.request().postDataJSON();assert.equal(args.p_subject_id,'fr');assert.equal(args.p_expected_user,user.id);
      const copyId='shared-exam-copy';
      if(!db.folders.has(copyId)){
        const copied={...frozenExam,id:copyId,subjectId:'fr',parentId:null,examSetIds:[]};db.folders.set(copyId,toRow(copied));
        for(const source of sharedSets){const copiedSet={...source.data,id:`copy-${source.id}`,subjectId:'fr',folderId:copyId};db.sets.set(copiedSet.id,toRow(copiedSet));}
        for(const source of sharedCards){const copiedCard={...source.data,id:`copy-${source.id}`,setId:`copy-${source.set_id}`,correctCount:0,incorrectCount:0};db.cards.set(copiedCard.id,toRow(copiedCard));}
      }
      return route.fulfill(json({status:'imported',kind:'exam',id:copyId,subjectId:'fr'}));
    });
    await page.locator('[data-share-kind="exam"]').click();await page.locator('#share-create').click();
    await page.locator('#share-link-field').waitFor({state:'visible'});
    assert.ok((await page.locator('#share-url').inputValue()).includes(`#share=${token}`));
    assert.ok((await page.locator('#share-explanation').textContent()).includes('feste Kopie'));
    await screenshot('share-link');
    await page.locator('#share-close').click();
    await page.locator('[data-exam-back]').click();
    await page.locator('[data-exam-subject-filter]').selectOption('fr');
    assert.equal(await page.locator('[data-exam-open]').count(),0);
    await page.locator('[data-exam-subject-filter]').selectOption('bio');
    await page.locator(`[data-exam-open="${exam.id}"]`).click();
    await page.locator('.management-menu > summary').click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator(`[data-exam-delete="${exam.id}"]`).click();
    await page.getByRole('heading',{name:'Tests',exact:true}).waitFor();
    assert.equal(db.folders.has(exam.id),false);
    assert.equal(db.sets.get('vocab').folder_id,'unit');
    assert.equal(db.sets.get(created.id).folder_id,null,'New test stacks return to the subject when a test is removed.');
    assert.equal(db.cards.size,4,'Deleting a test retains all original and newly created cards.');
    assert.equal(db.sets.size,4);
    await page.reload();await page.getByRole('heading',{name:'Bibliothek',exact:true}).waitFor();await testsNav();
    assert.equal(await page.locator('[data-exam-open]').count(),0);
    await page.evaluate(token=>{window.location.hash=`share=${token}`;},token);
    await page.locator('#shared-library-destination').waitFor({state:'visible'});
    assert.equal(await page.locator('#shared-library-kind').textContent(),'Geteilter Test');
    assert.ok((await page.locator('#shared-library-description').textContent()).includes('dessen Farbe'));
    assert.ok((await page.locator('#shared-library-subject').boundingBox()).height>=40,'Recipient subject selection keeps a full-sized touch target.');
    await page.locator('#shared-library-subject').selectOption('fr');
    await screenshot('share-import');
    await page.locator('#shared-library-action').click();
    await page.waitForFunction(()=>document.querySelector('#shared-library-action').textContent==='Test öffnen');
    await page.locator('#shared-library-action').click();await page.locator('#shared-library-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#exam-title').textContent(),frozenExam.name,'Sent link imports after original deletion.');
    assert.equal(await page.locator('.exam-notes').textContent(),frozenExam.examNotes);
    assert.equal(db.folders.get('shared-exam-copy').subject_id,'fr');
    await page.locator('[data-exam-back]').click();
    assert.equal(await page.locator('.exam-card').evaluate(card=>card.style.getPropertyValue('--exam-subject-color')),'#7D9DBD','Imported test uses recipient destination colour.');
    await screenshot('shared-copy');
    for(const table of Object.keys(db))db[table].clear();
    await page.reload();await page.getByRole('heading',{name:'Bibliothek',exact:true}).waitFor();await testsNav();
    await page.locator('[data-exam-create]').first().click();
    assert.equal(await page.locator('#form-dialog').evaluate(dialog=>dialog.open),true,'An empty library offers subject creation first.');
    await page.locator('#f-name').fill('Mathematik');await page.locator('#form-submit').click();
    await page.getByRole('heading',{name:'Mathematik',exact:true}).waitFor();await testsNav();
    await page.locator('[data-exam-create]').first().click();
    assert.equal(await page.locator('#exam-name').inputValue(),'');
    await page.locator('#exam-name').fill('Geometrie');
    await page.locator('#exam-date').fill(viewport.width===1366?'01022027':'01.02.2027');
    await page.locator('#exam-date').press('Tab');
    assert.equal(await page.locator('#exam-date').inputValue(),'01.02.2027','Compact numeric entry normalizes to the readable local date.');
    await page.locator('#exam-save').click();
    await page.locator('#exam-title').waitFor();
    assert.equal(await page.locator('#exam-title').textContent(),'Geometrie');
    await noOverflow();assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    console.log(`PASS exams ${engine} ${viewport.width}x${viewport.height} ${colorScheme} ${reduced?'reduce':'normal'}`);
  }finally{await context.close();}
}

let server;
try{
  server=process.env.QA_BASE_URL?{origin:new URL(process.env.QA_BASE_URL).origin}:await startServer();
  for(const engine of (process.env.QA_ENGINES||'chromium,webkit').split(',')){
    assert.ok(playwright[engine]);
    const browser=await playwright[engine].launch(engine==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});
    const profiles=[[{width:1366,height:768},false,'dark'],[{width:390,height:740},false,'light'],[{width:320,height:568},true,'dark']];
    try{for(const [viewport,reduced,colorScheme] of process.env.QA_SMOKE?profiles.slice(0,2):profiles)await verifyExams(browser,server.origin,engine,viewport,reduced,colorScheme);}
    finally{await browser.close();}
  }
}finally{if(server?.child){server.child.kill();await once(server.child,'exit');}}
