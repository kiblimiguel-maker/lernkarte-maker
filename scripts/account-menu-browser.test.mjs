/**
 * Optional account menu browser regressions. Runs a local Vite fixture with all
 * external traffic mocked; Google OAuth and production accounts are never used.
 * PLAYWRIGHT_MODULE=/path/to/playwright node scripts/account-menu-browser.test.mjs
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

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { throw new Error('Browserprüfung benötigt ein separat installiertes Playwright. Setze PLAYWRIGHT_MODULE auf dessen Modulpfad.'); }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = 'https://interaction-fixture.supabase.invalid';
const user = { id: '212c8ce0-d613-4864-a588-98da450ca3e3', email: 'very.long.account.address.for.overflow.check@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = {
  user, access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: 'authenticated' })).toString('base64url')}.c2ln`,
  refresh_token: 'fixture', expires_in: 3600, expires_at: expires, token_type: 'bearer'
};
const cardCount = 24;
assert.ok(Number.isFinite(cardCount), 'QA_CARD_COUNT muss eine Zahl sein.');
const fixture = {
  subjects: [{ id: 'fr', name: 'Französisch', color: '#7D9DBD', emoji: '🇫🇷', position: 0 }],
  folders: [{ id: 'unit', subjectId: 'fr', name: 'Unterricht', parentId: null, position: 0, color: '#7D9DBD' }],
  sets: [{ id: 'vocab', subjectId: 'fr', folderId: 'unit', name: 'Vokabeln', position: 0 }, { id: 'extra', subjectId: 'fr', folderId: 'unit', name: 'Weitere Karten', position: 1 }],
  cards: Array.from({ length: cardCount }, (_, index) => ({ id: `card-${String(index).padStart(8, '0')}`, setId: index < 20 ? 'vocab' : 'extra', front: `Deutsch ${index}`, back: `Französisch ${index}`, position: index, correctCount: 0, incorrectCount: 0 })),
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
  await context.addInitScript(session => {
    if (!sessionStorage.getItem('test-bootstrap-complete')) {
      localStorage.setItem('sb-interaction-fixture-auth-token', JSON.stringify(session));
      sessionStorage.setItem('test-bootstrap-complete', '1');
    }
    localStorage.setItem('wortwerk-donation-reminder-enabled-v1', 'false');
    localStorage.setItem('lernkarten-appearance-v1', 'system');
  }, session);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== backend) { unexpected.push(`${url.origin}${url.pathname}`); return route.abort(); }
    if (request.method() === 'OPTIONS') return route.fulfill(json(null));
    if (url.pathname === '/auth/v1/user') return route.fulfill(json(user));
    if (url.pathname === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated account chooser</title><p>OAuth fixture</p>' });
    if (url.pathname === '/rest/v1/rpc/save_library_organisation_rows') {
      const { p_table, p_rows } = request.postDataJSON();
      assert.ok(db[p_table], 'Unbekannte Tabelle in der isolierten Speicherung');
      for (const { row } of p_rows) db[p_table].set(row.id, row);
      return route.fulfill(json(null));
    }
    const table = url.pathname.split('/').at(-1);
    if (!db[table]) { unexpected.push(url.pathname); return route.fulfill({ ...json({ message: 'Unknown fixture endpoint' }), status: 404 }); }
    if (request.method() === 'POST') {
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
  return { page, context, errors, unexpected, db };
}

async function verifyAccountMenu(browser, origin, engine, viewport, reduced, colorScheme) {
  const { page, context, errors, unexpected } = await setup(browser, origin, viewport, reduced, colorScheme);
  const menu = page.locator('.account-menu'), trigger = menu.locator('summary'), panel = menu.locator('.account-menu-panel');
  const switchButton = page.locator('[data-qa-account-switch]');
  // macOS WebKit uses Option-Tab to include buttons when full keyboard access
  // is disabled in the browser's native preference.
  const optionTab = engine === 'webkit' && process.platform === 'darwin';
  const forwardTab = optionTab ? 'Alt+Tab' : 'Tab';
  const backwardTab = optionTab ? 'Alt+Shift+Tab' : 'Shift+Tab';
  const geometry = () => page.evaluate(() => Object.fromEntries(['.topbar', '#content', '#home-create-set', '.account-menu > summary'].map(selector => {
    const bounds = document.querySelector(selector).getBoundingClientRect();
    return [selector, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }];
  })));
  const isOpen = () => menu.evaluate(element => element.open);
  try {
    await page.locator('#account-switch').waitFor({ state: 'attached' });
    await page.locator('#account-switch').evaluate(button => button.setAttribute('data-qa-account-switch', ''));
    const closed = await geometry();
    await trigger.click();
    assert.equal(await isOpen(), true);
    assert.deepEqual(await geometry(), closed, 'Konto-Menü darf Kopfzeile oder Inhalt nicht verschieben.');
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, 'Menü muss horizontal im Bildschirm bleiben.');
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, 'Menü muss vertikal im Bildschirm bleiben.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontales Überlaufen');
    await page.locator('#sign-out').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#sign-out').isVisible(), true);
    await page.mouse.click(2, Math.min(viewport.height - 2, 260));
    assert.equal(await isOpen(), false, 'Klick ausserhalb muss das Menü schliessen.');

    await trigger.focus();
    await page.keyboard.press('Enter');
    assert.equal(await isOpen(), true);
    await page.keyboard.press(forwardTab);
    assert.equal(await switchButton.evaluate(button => button === document.activeElement), true, 'Tab soll die erste Kontoaktion erreichen.');
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(), false);
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape soll den Fokus zur Kontoschaltfläche zurückbringen.');

    await page.keyboard.press('Enter');
    for (let index = 0; index < 10 && await isOpen(); index++) await page.keyboard.press(forwardTab);
    assert.equal(await isOpen(), false, 'Menü soll beim Verlassen per Tab schliessen.');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press(backwardTab);
    assert.equal(await isOpen(), false, 'Rückwärts-Tab soll das Menü verlassen und schliessen.');

    // Patch only this test page's client. No Google request or sign-out occurs.
    await page.evaluate(async () => {
      const { supabase } = await import('/supabaseClient.js');
      window.__qaAuth = { calls: [], signOutCalls: 0 };
      supabase.auth.signOut = async () => { window.__qaAuth.signOutCalls++; return { error: null }; };
      supabase.auth.signInWithOAuth = options => {
        window.__qaAuth.calls.push(options);
        return new Promise(resolve => { window.__qaAuth.fail = () => resolve({ data: { provider: 'google', url: null }, error: new Error('Isolated OAuth failure') }); });
      };
    });
    await page.evaluate(() => {
      window.__qaOriginalRepository = window.WortwerkRepository;
      window.WortwerkRepository = { ...window.WortwerkRepository, flushLibraryWrites: async () => { throw new Error('Isolated flush failure'); } };
    });
    await trigger.click();
    await switchButton.click();
    await page.waitForFunction(() => !document.querySelector('[data-qa-account-switch]').disabled);
    assert.equal(await page.locator('#account-error').isVisible(), true);
    assert.match(await page.locator('#account-error').textContent(), /noch nicht vollständig gespeichert/);
    assert.equal(await page.evaluate(() => window.__qaAuth.calls.length), 0, 'Vor erfolgreicher Speicherung darf kein OAuth starten.');
    assert.equal(await page.locator('#app-shell').evaluate(element => element.inert), false);
    assert.equal(await page.locator('[data-open-subject="fr"]').count() > 0, true);
    await page.evaluate(() => { window.WortwerkRepository = window.__qaOriginalRepository; });
    if (!await isOpen()) await trigger.click();
    await switchButton.evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.__qaAuth.calls.length > 0);
    const pending = await page.evaluate(() => window.__qaAuth.calls);
    assert.equal(pending.length, 1, 'Doppelklick darf nur eine Kontoauswahl starten.');
    assert.equal(pending[0].provider, 'google');
    assert.equal(pending[0].options.queryParams.prompt, 'select_account');
    assert.equal(pending[0].options.redirectTo, new URL('/', origin).toString());
    assert.equal(pending[0].options.skipBrowserRedirect, true);
    assert.equal(await switchButton.isDisabled(), true);
    assert.equal(await switchButton.getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#sign-out').isDisabled(), true);
    assert.equal(await page.locator('#app-shell').evaluate(element => element.inert), true);
    await page.evaluate(() => window.__qaAuth.fail());
    await page.waitForFunction(() => !document.querySelector('[data-qa-account-switch]').disabled && window.__qaAuth.calls.length === 1);
    // The label is restored after a failed attempt, so resolve it afresh.
    await page.getByRole('button', { name: 'Konto wechseln', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: 'Konto wechseln', exact: true }).isEnabled(), true);
    assert.equal(await page.locator('#account-error').isVisible(), true);
    assert.match(await page.locator('#account-error').textContent(), /weiterhin mit deinem bisherigen Konto angemeldet/);
    assert.equal(await page.locator('#app-shell').isVisible(), true);
    assert.equal(await page.locator('[data-open-subject="fr"]').count() > 0, true, 'Bibliothek muss nach fehlgeschlagener Kontoauswahl erhalten bleiben.');
    assert.equal(await page.evaluate(async () => (await (await import('/supabaseClient.js')).supabase.auth.getSession()).data.session.user.id), user.id);
    assert.equal(await page.evaluate(() => window.__qaAuth.signOutCalls), 0);

    await page.evaluate(async backend => {
      const { supabase } = await import('/supabaseClient.js');
      supabase.auth.signInWithOAuth = async options => {
        window.__qaAuth.calls.push(options);
        const url = new URL('/auth/v1/authorize', backend);
        url.searchParams.set('provider', options.provider);
        url.searchParams.set('prompt', options.options.queryParams.prompt);
        url.searchParams.set('redirect_to', options.options.redirectTo);
        return { data: { provider: 'google', url: url.toString() }, error: null };
      };
    }, backend);
    if (!await isOpen()) await trigger.click();
    const authorize = page.waitForRequest(request => request.url().startsWith(`${backend}/auth/v1/authorize`));
    await page.getByRole('button', { name: 'Konto wechseln', exact: true }).click();
    const target = new URL((await authorize).url());
    assert.equal(target.searchParams.get('prompt'), 'select_account');
    assert.equal(target.searchParams.get('provider'), 'google');
    assert.equal(target.searchParams.get('redirect_to'), new URL('/', origin).toString());
    await page.waitForURL(`${backend}/auth/v1/authorize?*`);
    await page.goto(`${origin}/?error=access_denied&error_description=User%20cancelled`);
    await page.getByRole('heading', { name: 'Bibliothek', exact: true }).waitFor();
    assert.equal(await page.locator('#app-shell').isVisible(), true, 'Abgebrochene Auswahl muss das bestehende Konto behalten.');
    assert.equal(await page.locator('#account-error').isVisible(), true);
    assert.match(await page.locator('#account-error').textContent(), /abgebrochen/);
    assert.equal(new URL(page.url()).search, '', 'OAuth-Fehlerparameter müssen bereinigt werden.');
    assert.equal(await page.evaluate(async () => (await (await import('/supabaseClient.js')).supabase.auth.getSession()).data.session.user.id), user.id);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(`PASS account-menu ${engine} ${viewport.width}x${viewport.height} ${colorScheme} ${reduced ? 'reduce' : 'normal'}`);
  } finally { await context.close(); }
}


async function verifyAccountRights(browser, origin, engine, viewport, colorScheme) {
  const { page, context, errors, unexpected } = await setup(browser, origin, viewport, false, colorScheme);
  page.setDefaultTimeout(10_000);
  const dialog = page.locator('.privacy-account-dialog');
  const submit = dialog.locator('#privacy-account-submit');
  const phrase = dialog.locator('#privacy-delete-text');
  const otherCache = 'wortwerk-library-v1:another-fixture:pending';
  const ownCache = `wortwerk-library-v1:${user.id}`;
  const apiCalls = [];
  let deletionStatus = 'error';
  try {
    await page.route(`${origin}/api/delete-account`, async route => {
      const req = route.request();
      assert.equal(req.headers().authorization, `Bearer ${session.access_token}`);
      if (req.method() === 'GET') return route.fulfill(json({ available: true, recentAuthenticationRequired: true }));
      assert.equal(req.method(), 'POST');
      assert.deepEqual(req.postDataJSON(), { confirmation: 'KONTO LÖSCHEN' });
      apiCalls.push(deletionStatus);
      if (deletionStatus === 'success') return route.fulfill(json({ deleted: true }));
      if (deletionStatus === 'reauth') return route.fulfill({ ...json({ error: 'Bitte erneut anmelden.', code: 'REAUTH_REQUIRED' }), status: 401 });
      return route.fulfill({ ...json({ error: 'Löschung konnte nicht bestätigt werden.', code: 'DELETE_FAILED' }), status: 503 });
    });
    await page.route(`${backend}/auth/v1/logout*`, route => route.fulfill(json(null)));

    if (viewport.width < 800) await page.locator('#navigation-toggle').click();
    await page.locator('#card-theme-open').click();
    await page.locator('#settings-dialog [data-privacy-action="delete"]').click();
    await dialog.getByRole('heading', { name: 'Konto und Daten löschen' }).waitFor();
    assert.deepEqual(apiCalls, [], 'Das Öffnen der Einstellungen oder des Dialogs darf das Konto nicht löschen.');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    if (await page.locator('#settings-dialog').isVisible()) await page.locator('#settings-done').click();

    await page.locator('.account-menu summary').click();
    await page.locator('.account-menu [data-privacy-action="delete"]').click();
    await dialog.getByRole('heading', { name: 'Konto und Daten löschen' }).waitFor();
    assert.equal(await submit.isDisabled(), true);
    await phrase.fill('LÖSCHEN');
    assert.equal(await submit.isDisabled(), true);
    await phrase.fill('KONTO LÖSCHEN');
    await submit.click();
    await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').textContent(), /nicht bestätigt/);
    assert.ok(await page.locator('#app-shell').isVisible());
    assert.deepEqual(apiCalls, ['error']);

    deletionStatus = 'reauth';
    await submit.click();
    await dialog.locator('#privacy-reauthenticate').waitFor();
    assert.equal(await submit.isDisabled(), true);
    const authorize = page.waitForRequest(req => req.url().startsWith(`${backend}/auth/v1/authorize`));
    await dialog.locator('#privacy-reauthenticate').click();
    const redirect = new URL((await authorize).url());
    assert.equal(redirect.searchParams.get('prompt'), 'select_account');
    assert.equal(redirect.searchParams.get('max_age'), '0');
    await page.waitForURL(`${backend}/auth/v1/authorize?*`);
    // The fake OAuth provider gives control back to the same fixture account.
    await page.goto(origin);
    await dialog.getByRole('heading', { name: 'Konto und Daten löschen' }).waitFor();
    assert.equal(await phrase.inputValue(), '');
    assert.equal(await submit.isDisabled(), true);
    assert.deepEqual(apiCalls, ['error', 'reauth'], 'OAuth-Rückkehr darf kein Konto löschen');
    await page.evaluate(([other, own]) => {
      localStorage.setItem(other, 'preserved');
      localStorage.setItem(own, JSON.stringify({ subjects: [] }));
    }, [otherCache, ownCache]);
    deletionStatus = 'success';
    await phrase.fill('KONTO LÖSCHEN');
    await submit.click();
    await dialog.getByRole('heading', { name: 'Konto gelöscht' }).waitFor();
    await dialog.getByRole('button', { name: 'Schliessen', exact: true }).last().click();
    await page.locator('#auth-screen').waitFor();
    assert.equal(await page.locator('#app-shell').isVisible(), false);
    assert.deepEqual(apiCalls, ['error', 'reauth', 'success']);
    assert.deepEqual(await page.evaluate(([other, own]) => [
      localStorage.getItem(other), localStorage.getItem(own), localStorage.getItem('sb-interaction-fixture-auth-token')
    ], [otherCache, ownCache]), ['preserved', null, null]);
    await page.reload();
    await page.locator('#auth-screen').waitFor();
    assert.equal(await page.locator('#app-shell').isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(`PASS privacy account UI ${engine} ${viewport.width}px ${colorScheme}: 503, reauth, confirmation, logout and local cleanup`);
  } finally { await context.close(); }
}

let server;
try {
  server = await startServer();
  for (const engine of (process.env.QA_ENGINES || 'chromium,webkit').split(',')) {
    assert.ok(playwright[engine], `Unbekannte Browserengine: ${engine}`);
    const launch = engine === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {};
    const browser = await playwright[engine].launch(launch);
    try {
      for (const [width, height, scheme] of [[1366, 768, 'light'], [390, 740, 'dark']]) {
        await verifyAccountRights(browser, server.origin, engine, { width, height }, scheme);
      }
      if (process.env.QA_ACCOUNT_SCENARIOS === 'privacy') continue;
      for (const [viewport, reduced, colorScheme] of [[{ width: 1366, height: 768 }, false, 'light'], [{ width: 834, height: 650 }, false, 'dark'], [{ width: 390, height: 740 }, false, 'dark'], [{ width: 320, height: 480 }, true, 'light'], [{ width: 740, height: 320 }, true, 'dark']]) {
        await verifyAccountMenu(browser, server.origin, engine, viewport, reduced, colorScheme);
      }
    } finally { await browser.close(); }
  }
} finally {
  if (server) { server.child.kill(); await once(server.child, 'exit'); }
}
