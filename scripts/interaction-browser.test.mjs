/**
 * Optional browser regression checks; production services are never contacted.
 * Install Playwright in a separate test environment, then run:
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/interaction-browser.test.mjs
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE, QA_ENGINES=chromium, QA_CARD_COUNT=1813,
 * QA_SCREENS=desktop,phone,compact. Timings are observations, not device FPS guarantees.
 * Browser binaries must already be installed. No dependency is downloaded here.
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
const user = { id: '212c8ce0-d613-4864-a588-98da450ca3e3', email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = {
  user, access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: 'authenticated' })).toString('base64url')}.c2ln`,
  refresh_token: 'fixture', expires_in: 3600, expires_at: expires, token_type: 'bearer'
};
const cardCount = Math.max(20, Number.parseInt(process.env.QA_CARD_COUNT || '1813', 10));
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

async function setup(browser, origin, viewport, reduced) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800, colorScheme: viewport.width < 800 ? 'dark' : 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const db = Object.fromEntries(Object.entries(fixture).map(([table, records]) => [table, new Map(records.map(data => [data.id, toRow(structuredClone(data))]))]));
  const errors = [], unexpected = [];
  await context.addInitScript(session => {
    localStorage.setItem('sb-interaction-fixture-auth-token', JSON.stringify(session));
    localStorage.setItem('wortwerk-donation-reminder-enabled-v1', 'false');
    localStorage.setItem('lernkarten-appearance-v1', 'system');
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    window.__qaMotionPreference = { reduce: preference.matches, changes: 0 };
    preference.addEventListener('change', event => {
      window.__qaMotionPreference = { reduce: event.matches, changes: window.__qaMotionPreference.changes + 1 };
    });
    window.__qaLongTasks = [];
    if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => { window.__qaLongTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))); }).observe({ type: 'longtask' });
    }
  }, session);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && url.pathname === '/' && request.isNavigationRequest()) {
      const response = await route.fetch();
      // Production CSS minification expresses this custom property in seconds.
      const body = (await response.text()).replace('<head>', '<head><style>:root{--study-flip-duration:.24s!important;--study-step-duration:.16s!important;--study-swipe-duration:.8s!important}</style>');
      return route.fulfill({ response, body });
    }
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'va.vercel-scripts.com') return route.fulfill({ status: 200, body: '' });
    if (url.origin !== backend) { unexpected.push(`${url.origin}${url.pathname}`); return route.abort(); }
    if (request.method() === 'OPTIONS') return route.fulfill(json(null));
    if (url.pathname === '/auth/v1/user') return route.fulfill(json(user));
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
  return { page, context, errors, unexpected };
}

async function verifyStudy(browser, origin, engine, viewport, reduced) {
  const { page, context, errors, unexpected } = await setup(browser, origin, viewport, reduced);
  try {
    const navigation = await page.evaluate(() => {
      const samples = [];
      for (let round = 0; round < 12; round++) {
        for (const [selector, title] of [['[data-open-subject="fr"]', 'Französisch'], ['[data-open-folder="unit"]', 'Unterricht'], ['[data-quick-edit="vocab"]', 'Vokabeln'], ['#go-back', 'Unterricht'], ['#go-back', 'Französisch'], ['#go-back', 'Bibliothek']]) {
          const time = performance.now();
          document.querySelector(selector).click();
          if (document.querySelector('#content h1').textContent !== title) throw new Error('Navigation zeigte eine veraltete Ansicht.');
          samples.push(performance.now() - time);
        }
      }
      samples.sort((a, b) => a - b);
      return { p50: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * .95)] };
    });
    await page.evaluate(() => {
      document.querySelector('[data-open-subject="fr"]').click();
      document.querySelector('[data-open-folder="unit"]').click();
      document.querySelector('[data-quick-edit="vocab"]').click();
    });
    const beginMs = await page.evaluate(() => { const time = performance.now(); document.querySelector('#start-study').click(); return performance.now() - time; });
    const card = page.locator('.study-card-slot.is-active .study-card');
    for (const back of [true, false]) {
      if (!back) await card.press('Space');
      else if (viewport.width < 800) await card.tap();
      else await card.click();
      await page.locator(`.study-card-slot.is-active .study-card[aria-pressed="${back}"]`).waitFor();
      const flip = await card.evaluate(async button => {
        const faces = [...button.querySelectorAll('.study-face')];
        const animations = faces.flatMap(face => face.getAnimations());
        const visible = () => faces.map(face => getComputedStyle(face).visibility === 'visible');
        if (!animations.length) return { duration: 0, end: visible() };
        const duration = animations[0].effect.getTiming().duration;
        for (const animation of animations) animation.pause();
        await Promise.all(animations.map(animation => animation.ready));
        const samples = [.3, .7].map(fraction => {
          for (const animation of animations) animation.currentTime = duration * fraction;
          const face = faces.find(face => getComputedStyle(face).visibility === 'visible');
          return { visible: visible(), tilt: Math.abs(new DOMMatrix(getComputedStyle(face).transform).m13) };
        });
        for (const animation of animations) animation.finish();
        return { duration, samples, end: visible() };
      });
      assert.equal(flip.duration, reduced ? 0 : 240, 'Full flip duration with production CSS units');
      if (!reduced) {
        assert.deepEqual(flip.samples.map(sample => sample.visible), [[back, !back], [!back, back]]);
        assert.ok(flip.samples.every(sample => sample.tilt > .1), 'Both halves rotate in 3D');
      }
      assert.deepEqual(flip.end, [!back, back], 'Only the correct face remains visible');
      assert.equal(await card.getAttribute('aria-pressed'), String(back));
    }
    const quick = await page.evaluate(() => {
      const active = () => document.querySelector('.study-card-slot.is-active .study-card');
      const read = () => ({ count: document.querySelectorAll('.study-card-slot.is-active').length, front: document.querySelector('.study-card-slot.is-active .study-copy-main').textContent, pressed: active().getAttribute('aria-pressed') });
      const exitDuration = () => document.querySelector('.is-leaving .study-card-swipe-layer')?.getAnimations()[0]?.effect.getTiming().duration ?? 0;
      active().focus();
      for (let index = 0; index < 15; index++) active().click();
      const flips = read();
      document.querySelector('#study-next').click();
      const next = read();
      const forwardDuration = exitDuration();
      if (active() !== document.activeElement) throw new Error('Kartenfokus ging beim Wechsel verloren.');
      for (let index = 0; index < 8; index++) { document.querySelector('#study-next').click(); document.querySelector('#study-prev').click(); }
      document.querySelector('#study-prev').click();
      const back = read(), backDuration = exitDuration(), time = performance.now();
      document.querySelector('#answer-yes').click();
      const ratingDuration = exitDuration();
      const scoreMs = performance.now() - time;
      document.querySelector('#answer-yes').click();
      document.querySelector('#answer-no').click();
      return { flips, next, back, forwardDuration, backDuration, ratingDuration, scoreMs, current: read(), known: document.querySelector('#known-count').textContent, missed: document.querySelector('#missed-count').textContent, reviewed: document.querySelector('#study-progress-track').getAttribute('aria-valuenow') };
    });
    assert.equal(quick.flips.pressed, 'true');
    assert.equal(quick.flips.count, 1);
    assert.equal(quick.next.front, 'Deutsch 1');
    assert.equal(quick.next.pressed, 'false');
    assert.equal(quick.back.front, 'Deutsch 0');
    assert.deepEqual([quick.forwardDuration, quick.backDuration, quick.ratingDuration], reduced ? [0, 0, 0] : [160, 160, 800]);
    assert.equal(quick.current.front, 'Deutsch 3');
    assert.equal(quick.known, '2');
    assert.equal(quick.missed, '1');
    assert.equal(quick.reviewed, '3');
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.study-card-slot.is-active .study-copy-main').first().textContent(), 'Deutsch 3');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Emulation can resolve before the browser dispatches its media change event.
    await page.waitForFunction(() => window.__qaMotionPreference.reduce);
    assert.deepEqual(await page.locator('#study-stage').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').map(animation => animation.constructor.name)), []);
    if (!reduced) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => !window.__qaMotionPreference.reduce);
    }
    const frames = await page.evaluate(() => new Promise(resolve => {
      const frameTimes = [], handlerTimes = [], started = performance.now();
      let previous, frame = 0, forward = true;
      const tick = now => {
        if (previous !== undefined) frameTimes.push(now - previous);
        previous = now;
        const time = performance.now();
        if (frame % 2 === 0) document.querySelector('.study-card-slot.is-active .study-card').click();
        if (frame % 8 === 0) {
          document.querySelector(forward ? '#study-next' : '#study-prev').click();
          forward = !forward;
        }
        handlerTimes.push(performance.now() - time);
        if (++frame < 48) return requestAnimationFrame(tick);
        const stats = values => { values.sort((a, b) => a - b); return { p50: values[Math.floor(values.length / 2)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) }; };
        resolve({ frameIntervalsMs: stats(frameTimes), handlerMs: stats(handlerTimes), longTasks: window.__qaLongTasks.filter(entry => entry.start >= started).length, longTaskObserver: Boolean(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) });
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(await page.locator('.study-card-slot.is-active .study-copy-main').first().textContent(), 'Deutsch 3');
    await page.locator('#shuffle-toggle').click();
    assert.equal(await page.locator('#known-count').textContent(), '2');
    assert.equal(await page.locator('#missed-count').textContent(), '1');
    await page.evaluate(() => { for (let index = 0; index < 30 && document.querySelector('#study-complete').hidden; index++) document.querySelector('#answer-yes').click(); });
    assert.equal(await page.locator('#study-complete').getAttribute('hidden'), null);
    assert.equal(await page.locator('#result-unrated').textContent(), '0');
    assert.equal(await page.locator('#result-known').textContent(), '20');
    await page.locator('#finish-study').click();
    assert.equal(await page.locator('#study-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'start-study');
    await page.locator('#start-study').click();
    await page.evaluate(() => { document.querySelector('#answer-no').click(); for (let index = 0; index < 30 && document.querySelector('#study-complete').hidden; index++) document.querySelector('#answer-yes').click(); });
    assert.equal(await page.locator('#result-missed').textContent(), '1');
    await page.locator('#retry-missed').click();
    assert.equal(await page.locator('#known-count').textContent(), '0');
    assert.equal(await page.locator('#missed-count').textContent(), '0');
    assert.equal(await page.locator('#study-progress-label').textContent(), 'Karte 1 von 1');
    await page.locator('#answer-yes').click();
    assert.equal(await page.locator('#result-known').textContent(), '1');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#study-dialog').evaluate(dialog => dialog.open), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontales Überlaufen');
    console.log(`PASS study ${engine} ${viewport.width}x${viewport.height} ${reduced ? 'reduce' : 'normal'} ${JSON.stringify({ cards: cardCount, navigationHandlerMs: navigation, beginMs, scoreMs: quick.scoreMs, frames })}`);
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
      const screens = { desktop: [{ width: 1366, height: 768 }, false], phone: [{ width: 390, height: 740 }, false], compact: [{ width: 320, height: 568 }, true] };
      for (const name of (process.env.QA_SCREENS || 'desktop,phone,compact').split(',')) {
        assert.ok(screens[name], `Unbekannte Bildschirmgrösse: ${name}`);
        const [viewport, reduced] = screens[name];
        await verifyStudy(browser, server.origin, engine, viewport, reduced);
      }
    } finally { await browser.close(); }
  }
} finally {
  if (server) { server.child.kill(); await once(server.child, 'exit'); }
}
