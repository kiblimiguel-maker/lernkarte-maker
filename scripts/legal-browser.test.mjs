/** Optional isolated legal UI regressions; no backend, account or Google request. */
import assert from 'node:assert/strict';
import { legalConfig } from '../legal-config.mjs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{throw new Error('Diese Browserprüfung benötigt separat installiertes Playwright. Setze PLAYWRIGHT_MODULE.');}
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const token = 'a'.repeat(64);
const backend = 'https://legal-fixture.supabase.invalid';
const supportEmail = 'support@example.invalid';
const privacyEmail = 'privacy@example.invalid';
async function startServer(){
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin=`http://127.0.0.1:${port}`,child=spawn(process.execPath,[resolve(repo,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:repo,env:{...process.env,VITE_SUPABASE_URL:backend,VITE_SUPABASE_PUBLISHABLE_KEY:'isolated-browser-fixture-only'},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-1500);});
  for(let index=0;index<100;index++){if(child.exitCode!==null)throw new Error(output);try{if((await fetch(origin)).ok)return{origin,child};}catch{}await delay(100);}
  child.kill();throw new Error('Die isolierte Vorschau konnte nicht starten.');
}
const fixture=`<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/legal-ui.css"></head><body><main class="main-area" style="padding:24px"><h1>Lernkarten Maker</h1><button class="quiet-button" id="underlying">Lernfunktion</button></main><script type="module">
import {createLegalUI} from '/legal-ui.mjs';
import {legalConfig} from '/legal-config.mjs';
const fixtureConfig = new URL(location.href).searchParams.has('contacts')
  ? {...legalConfig, supportEmail:'${supportEmail}', privacyEmail:'${privacyEmail}'}
  : {...legalConfig, supportEmail:'', privacyEmail:'', operator:{...legalConfig.operator,email:''}};
window.__analytics={available:false,current:null,listeners:[],calls:[],isAvailable(){return this.available},readConsent(){return this.current},subscribe(callback){this.listeners.push(callback);return()=>{}},consent(choice){this.calls.push(choice);this.current={choice,version:'test',updatedAt:'2026-11-25T12:00:00Z'};this.listeners.forEach(callback=>callback())},revoke(){this.calls.push('revoked');this.current={choice:'necessary',version:'test',updatedAt:'2026-11-25T12:00:00Z'};this.listeners.forEach(callback=>callback())}};
window.__legal = createLegalUI({config:fixtureConfig, analytics:window.__analytics});
document.getElementById('underlying').onclick=()=>document.body.dataset.used='true';
</script></body></html>`;

async function verify(browser,origin,engine,viewport,colorScheme,reduced){
  const context=await browser.newContext({viewport,colorScheme,isMobile:viewport.width<800,hasTouch:viewport.width<800,reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage(),unexpected=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === backend && url.pathname === '/rest/v1/rpc/preview_library_share' && request.method() === 'POST') {
      assert.deepEqual(request.postDataJSON(), { p_token: token });
      return route.fulfill({ json: { kind: 'set', title: 'Öffentliche Testfreigabe', cardCount: 3 } });
    }
    if (url.origin !== origin) {
      unexpected.push(url.origin);
      return route.abort();
    }
    if (url.pathname === '/legal-fixture') return route.fulfill({ contentType:'text/html', body:fixture });
    return route.continue();
  });
  const open=pageName=>page.evaluate(pageName=>window.__legal.open(pageName),pageName);
  const close=()=>page.locator('#legal-dialog [data-legal-close]').last().click();
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const screenshot=async label=>{if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,`legal-${engine}-${viewport.width}-${label}.png`),fullPage:true,animations:'disabled'});}};
  try{
    await page.goto(origin);
    const entry = page.locator('#auth-screen');
    await entry.waitFor();
    const expectedNotices = {
      privacy: ['Informationen zum Datenschutz', 'Google Analytics ist derzeit ausgeschaltet', legalConfig.privacyEmail],
      terms: ['Nutzungsregeln', 'Änderungen am Original', legalConfig.supportEmail],
      imprint: ['Anbieter und Kontakt', legalConfig.appName, legalConfig.supportEmail]
    };
    for (const name of ['privacy','terms','imprint','contact']) {
      await entry.locator(`[data-legal-page="${name}"]`).click();
      await page.locator('#legal-dialog[open]').waitFor();
      assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('legal'),name);
      if (name === 'contact') {
        assert.equal(await page.locator('.legal-mail').getAttribute('href'), `mailto:${legalConfig.supportEmail}`);
        assert.equal(new URL(await page.locator('[data-contact-send]').getAttribute('href')).pathname, legalConfig.supportEmail);
      } else {
        const [heading, excerpt, email] = expectedNotices[name];
        assert.equal(await page.locator('.legal-notice h3').innerText(), heading);
        assert.ok((await page.locator('.legal-section').allTextContents()).join(' ').includes(excerpt));
        assert.equal(await page.locator('.legal-mail').getAttribute('href'), `mailto:${email}`);
      }
      await close();
      await page.locator('#legal-dialog').waitFor({state:'hidden'});
    }
    assert.equal(await page.locator('.consent-banner').isVisible(),false,'Public sign-in supports every legal link without activating analytics.');
    await page.goto(`${origin}/#share=${token}`);
    await page.locator('#shared-library-report').click();
    await page.locator('#legal-dialog[open]').waitFor();
    const report = new URL(await page.locator('[data-contact-send]').getAttribute('href'));
    assert.equal(report.pathname, legalConfig.supportEmail);
    assert.equal(report.searchParams.get('subject'), 'Lernkarten Maker – Inhalt melden');
    assert.equal(report.searchParams.get('body')?.trim(), `Freigabelink: ${legalConfig.website}#share=${token}`);
    const footer = await page.locator('#legal-dialog .legal-actions').boundingBox();
    assert.ok(footer.y + footer.height <= viewport.height + 1);
    await screenshot('report');
    await close();
    await page.locator('#shared-library-dialog[open]').waitFor();

    await page.goto(`${origin}/legal-fixture#share=${token}&legal=privacy`);await page.locator('#legal-dialog[open]').waitFor();
    assert.ok((await page.locator('.legal-body').innerText()).includes('noch nicht freigegeben'));
    assert.equal((await page.locator('.legal-body').innerText()).includes('[INTERN OFFEN:'),false);
    assert.equal(await page.locator('#legal-dialog-title').evaluate(element=>document.activeElement===element),true);
    await close();assert.equal(new URL(page.url()).hash,`#share=${token}`);
    await open('contact');assert.equal(await page.locator('[data-contact-send]').count(),0);assert.equal(await page.locator('.legal-mail').count(),0);await screenshot('contact');await close();
    await open('cookies');assert.equal(await page.locator('#legal-analytics-enabled').isDisabled(),true);assert.equal(await page.locator('.consent-banner').isVisible(),false);await close();
    await page.evaluate(()=>{window.__analytics.available=true;window.__analytics.current=null;window.__analytics.listeners.forEach(callback=>callback());});
    await page.locator('.consent-banner').waitFor({state:'visible'});
    assert.match(await page.locator('.consent-banner').innerText(), /Google Analytics 4/);
    await page.locator('.consent-banner [data-legal-page="privacy"]').click();
    await page.locator('#legal-dialog[open]').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__analytics.calls), [], 'Reading the privacy notice does not consent.');
    await close();
    const yes=await page.locator('.consent-banner [data-consent-choice="accepted"]').boundingBox(),no=await page.locator('.consent-banner [data-consent-choice="necessary"]').boundingBox();
    assert.ok(Math.abs(yes.width-no.width)<=1&&Math.abs(yes.height-no.height)<=1,'Accept and reject remain equal controls.');
    await page.locator('#underlying').click();assert.equal(await page.locator('body').getAttribute('data-used'),'true','The banner does not open a blocking dialog.');
    await page.locator('.consent-banner [data-consent-choice="accepted"]').click();await page.locator('.consent-banner').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.__analytics.calls),['accepted']);
    await open('cookies');assert.equal(await page.locator('#legal-analytics-enabled').isChecked(),true);await page.locator('#legal-analytics-enabled').uncheck();await page.locator('[data-cookie-save]').click();
    assert.deepEqual(await page.evaluate(()=>window.__analytics.calls),['accepted','revoked'],'Revocation does not double-save through a fallback.');await screenshot('cookies');await close();
    await page.evaluate(() => {
      const analytics = window.__analytics;
      analytics.current = { choice: 'accepted', version: 'test', updatedAt: '2026-11-25T12:00:00Z' };
      analytics.revoke = () => { analytics.current = null; return false; };
    });
    await open('cookies');
    assert.equal(await page.locator('#legal-analytics-enabled').isChecked(), true);
    await page.locator('#legal-dialog [data-consent-choice="necessary"]').click();
    assert.equal(await page.locator('#legal-analytics-enabled').isChecked(), false);
    assert.match(await page.locator('.legal-body [role="alert"]').innerText(), /dauerhaften Widerruf blockiert/);
    await close();
    await page.goto(`${origin}/legal-fixture?contacts&private_query=not-for-mail#share=${token}&access_token=not-for-mail&legal=report`);
    const mail = () => page.locator('[data-contact-send]').getAttribute('href').then(href => new URL(href));
    const directReport = await mail();
    assert.equal(directReport.pathname, supportEmail);
    assert.equal(directReport.searchParams.get('body')?.trim(), `Freigabelink: ${legalConfig.website}#share=${token}`);
    assert.ok(!decodeURIComponent(directReport.href).includes('not-for-mail'), 'Only the public share token goes into the draft.');
    await close();

    await open('contact');
    await page.locator('#legal-contact-category').selectOption('Auskunft über meine Daten');
    const access = await mail();
    assert.equal(access.pathname, privacyEmail);
    assert.equal(access.searchParams.get('subject'), 'Lernkarten Maker – Auskunft über meine Daten');
    assert.equal(access.searchParams.get('body'), '');
    await page.locator('#legal-contact-category').selectOption('Kontolöschung anfragen');
    const deletion = await mail();
    assert.equal(deletion.pathname, privacyEmail);
    assert.equal(deletion.searchParams.get('subject'), 'Lernkarten Maker – Kontolöschung anfragen');
    assert.equal(deletion.searchParams.get('body'), '');
    await page.locator('#legal-contact-category').selectOption('Inhalt melden');
    assert.equal((await mail()).pathname, supportEmail);
    assert.equal((await mail()).searchParams.get('body'), '');
    await close();

    await page.evaluate(() => history.replaceState(null, '', location.pathname));
    await open('report');
    assert.equal((await mail()).pathname, supportEmail);
    assert.equal((await mail()).searchParams.get('body'), '');
    assert.ok((await page.locator('.legal-body').innerText()).includes('Füge deiner Nachricht den betreffenden Freigabelink bei'));
    await close();
    assert.equal(await open('reports'), false);
    await overflow();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(`PASS legal ${engine} ${viewport.width}x${viewport.height} ${colorScheme} ${reduced?'reduce':'normal'}`);
  }finally{await context.close();}
}
let server;
try{
  server=await startServer();
  for(const engine of (process.env.QA_ENGINES||'chromium,webkit').split(',')){
    const browser=await playwright[engine].launch(engine==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});
    try{for(const [viewport,colorScheme,reduced] of [[{width:1366,height:768},'dark',false],[{width:834,height:1112},'light',false],[{width:390,height:740},'light',false],[{width:320,height:568},'dark',true]])await verify(browser,server.origin,engine,viewport,colorScheme,reduced);}finally{await browser.close();}
  }
}finally{if(server?.child){server.child.kill();await once(server.child,'exit');}}
