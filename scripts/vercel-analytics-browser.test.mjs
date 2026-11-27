/**
 * Wire-level test with the installed Vercel loader and the deployed SDK.
 * Only a GET for the SDK code can reach Vercel. Browser requests are intercepted.
 * PLAYWRIGHT_MODULE=/path/to/playwright node scripts/vercel-analytics-browser.test.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engines = { chromium, webkit };
const origin = 'https://lernkarte-maker.vercel.app';
const publicPage = origin + '/';
const sdkPath = '/_vercel/insights/script.js';
const viewPath = '/_vercel/insights/view';
const referrerPath = '/fixture-private-source';
const choiceCookie = '__Host-lernkarten-vercel-choice';
const root = new URL('../', import.meta.url);
const sources = new Map();
sources.set('/vercel-analytics.mjs', await readFile(new URL('vercel-analytics.mjs', root), 'utf8'));
sources.set('/vercel-loader.mjs', await readFile(new URL(import.meta.resolve('@vercel/analytics')), 'utf8'));
const sdkResponse = await fetch(origin + sdkPath, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
assert.equal(sdkResponse.status, 200, 'Vercel serves its analytics SDK');
assert.match(sdkResponse.headers.get('content-type') || '', /javascript/);
sources.set(sdkPath, await sdkResponse.text());
sources.set('/fixture.mjs', `
  import { createVercelAnalytics } from '/vercel-analytics.mjs';
  window.api = createVercelAnalytics({
    window, document, productionBuild: true,
    deploymentEnvironment: window.fixtureEnvironment || 'production',
    loadSdk: () => import('/vercel-loader.mjs')
  });
`);
const html = '<!doctype html><meta name="referrer" content="no-referrer"><title>Private fixture title</title><script type="module" src="/fixture.mjs"></script>';
const privateValue = 'PrivateFixtureValue';

for (const name of (process.env.QA_ENGINES || 'chromium,webkit').split(',')) {
  assert.ok(engines[name], `Unknown browser engine ${name}`);
  const browser = await engines[name].launch(name === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
  try {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
    });
    // The SDK skips automated clients. This affects only the fully intercepted
    // fixture so that a real pageview reaches the route handler under test.
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }));
    const scriptRequests = [], views = [], unexpected = [], errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));

    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname === viewPath) {
        views.push({ method: request.method(), headers: request.headers(), body: request.postDataJSON() });
        return route.fulfill({ status: 204 });
      }
      if (url.origin === origin && sources.has(url.pathname)) {
        if (url.pathname === sdkPath) scriptRequests.push(request.url());
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: sources.get(url.pathname) });
      }
      if (url.origin === origin && url.pathname === '/' && request.isNavigationRequest()) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      if (url.origin === origin && url.pathname === referrerPath && request.isNavigationRequest()) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><a href="/" referrerpolicy="unsafe-url">Open fixture</a>' });
      }
      unexpected.push({ method: request.method(), pathname: url.pathname, hostname: url.hostname });
      return route.abort();
    });

    async function open(page, url = publicPage, options = {}) {
      const response = await page.goto(url, options);
      assert.equal(response?.status(), 200);
      await page.waitForFunction(() => Boolean(window.api));
      await page.waitForLoadState('networkidle');
    }

    function counts() {
      return { sdk: scriptRequests.length, views: views.length };
    }

    function assertView(view) {
      assert.equal(view.method, 'POST');
      assert.equal(view.headers.referer, undefined, 'no outgoing HTTP referrer');
      assert.equal(view.body.o, publicPage, 'only the canonical landing URL is reported');
      assert.ok(!view.body.r, 'a direct visit reports no referring address');
      for (const key of ['en', 'ed', 'userId', 'groupId', 'props', '__cdp']) {
        assert.ok(!Object.hasOwn(view.body, key), `view omits ${key}`);
      }
      assert.ok(!JSON.stringify(view.body).includes(privateValue));
    }

    const page = await context.newPage();
    await open(page);
    assert.equal(await page.evaluate(() => api.isAvailable()), true);
    assert.equal(await page.evaluate(() => api.shouldPrompt()), true);
    assert.deepEqual(counts(), { sdk: 0, views: 0 }, 'no SDK or view before opt-in');

    assert.equal(await page.evaluate(() => api.consent('necessary')), true);
    await open(page);
    assert.equal(await page.evaluate(() => api.readConsent()?.choice), 'necessary', 'remember denial');
    assert.deepEqual(counts(), { sdk: 0, views: 0 }, 'denial survives reopening');

    const [accepted] = await Promise.all([
      page.evaluate(() => api.consent('accepted')),
      page.waitForResponse(response => response.url() === origin + viewPath && response.status() === 204)
    ]);
    assert.equal(accepted, true);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(counts(), { sdk: 1, views: 1 }, 'one view following opt-in');
    assertView(views[0]);
    const cookie = (await context.cookies(origin)).find(item => item.name === choiceCookie);
    assert.ok(cookie, 'the consent decision is recorded in a first-party cookie');
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'Lax');
    assert.equal(cookie.domain, new URL(origin).hostname);
    assert.equal(cookie.path, '/');
    assert.ok(!cookie.value.includes(privateValue), 'the choice cookie holds no private input');

    await page.evaluate(() => {
      api.consent('accepted');
      history.pushState({}, '', '/#legal=cookies');
      history.replaceState({}, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await page.waitForLoadState('networkidle');
    assert.deepEqual(counts(), { sdk: 1, views: 1 }, 'no duplicate or SPA route view');

    await page.reload();
    await page.waitForFunction(() => Boolean(window.api));
    await page.waitForLoadState('networkidle');
    assert.deepEqual(counts(), { sdk: 2, views: 2 }, 'valid prior consent permits one view on a new document');
    assertView(views[1]);

    const allowed = counts();
    for (const url of [
      publicPage + '?code=' + privateValue,
      publicPage + '#share=' + privateValue,
      publicPage + '#privacy-action=delete',
      publicPage + '#legal=privacy'
    ]) {
      const excluded = await context.newPage();
      await open(excluded, url);
      await excluded.evaluate(() => {
        history.replaceState({}, '', '/');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await excluded.waitForLoadState('networkidle');
      assert.deepEqual(counts(), allowed, 'sensitive initial document remains excluded after URL cleanup');
      await excluded.close();
    }

    const referred = await context.newPage();
    await referred.goto(origin + referrerPath + '?code=' + privateValue);
    await referred.getByRole('link', { name: 'Open fixture' }).click();
    await referred.waitForFunction(() => Boolean(window.api));
    await referred.waitForLoadState('networkidle');
    assert.ok((await referred.evaluate(() => document.referrer)).includes(privateValue), 'test has a private incoming referrer');
    assert.deepEqual(counts(), allowed, 'no SDK on an unsafe incoming referrer');
    await referred.close();

    const legacy = await context.newPage();
    await legacy.addInitScript(value => localStorage.setItem('__va_attribution', JSON.stringify({ userId: value })), privateValue);
    await open(legacy);
    assert.deepEqual(counts(), allowed, 'legacy SDK attribution blocks loading');
    await legacy.evaluate(() => localStorage.removeItem('__va_attribution'));
    await legacy.close();

    const preview = await context.newPage();
    await preview.addInitScript(() => { window.fixtureEnvironment = 'preview'; });
    await open(preview);
    assert.equal(await preview.evaluate(() => api.isAvailable()), false, 'preview unavailable even with valid preference');
    assert.deepEqual(counts(), allowed, 'no SDK in Preview');
    await preview.close();

    assert.equal(await page.evaluate(() => api.revoke()), true);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.api));
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => api.readConsent()?.choice), 'necessary', 'revoked preference survives reload');
    assert.deepEqual(counts(), allowed, 'no request after revocation and reload');
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(`PASS Vercel SDK wire test ${name}: consent, duplicate prevention, excluded URLs and referrers, revocation, Preview.`);
  } finally {
    await browser.close();
  }
}
