/**
 * Optional real-Google-SDK network regression with synthetic pages and a dummy
 * measurement ID. The SDK is downloaded; ALL collection requests are fulfilled
 * locally before network transmission. Production analytics is never enabled.
 * PLAYWRIGHT_MODULE=/path/to/playwright npm run test:analytics-browser
 * Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE, QA_ENGINES=chromium, QA_ANALYTICS_RESULTS.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright'); }
catch { throw new Error('Die Browserprüfung benötigt separat installiertes Playwright. Setze PLAYWRIGHT_MODULE auf dessen Modulpfad.'); }
const root=new URL('../',import.meta.url),origin='https://analytics-fixture.invalid',measurementId='G-LMTEST0000';
const consentKey='lernkarten-privacy-choice-v1';
const choiceCookie='__Host-lernkarten-statistics-choice';
const sources=Object.fromEntries(await Promise.all(['analytics.mjs','analytics-config.mjs','legal-config.mjs'].map(async name=>[name,await readFile(new URL(name,root),'utf8')])));
const fixtureModule=`import {analyticsConfig} from '/analytics-config.mjs';
import {createAnalyticsController} from '/analytics.mjs';
window.analyticsFixtureWasReloaded = sessionStorage.getItem('analytics-fixture-reloaded') === 'yes';
window.initAnalytics=async function(enabled=true){
  window.api?.dispose();
  window.api=createAnalyticsController({window,document,legalReady:true,
    config:{...analyticsConfig,enabled,legalApproved:true,minorsEligibilityVerified:true,enhancedMeasurementVerifiedDisabled:true,advertisingAndSharingVerifiedDisabled:true,
      productionOrigins:[${JSON.stringify(origin)}],measurementId:${JSON.stringify(measurementId)},cookieExpiresSeconds:3600,consentMaxAgeDays:1},
    runtime:{productionBuild:true,deploymentEnvironment:'production'},
    reload(){sessionStorage.setItem('analytics-fixture-reloaded','yes');window.location.reload();}});
  const other=sessionStorage.getItem('analytics-fixture-other')==='yes';
  const user={id:other?'PRIVATE_B':'PRIVATE_ACCOUNT',app_metadata:{privacy_analytics_grant:other?'292ff6d9-0000-4000-8000-000000000002':'17ed1620-b891-4aae-b47f-f6db7736a77d'}};
  await window.api.updateAudience(user,async()=>user);
  window.api.navigate('library');
};
await window.initAnalytics();window.analyticsReady=true;`;
const html='<!doctype html><meta name="referrer" content="no-referrer"><title>PRIVATE_DECK PRIVATE_EMAIL@example.invalid</title><input value="PRIVATE_CARD_CONTENT"><main>Isolated analytics test</main><script type="module" src="/fixture.mjs"></script>';
function eventNames(requests) {
  return requests.flatMap(({ url, body }) => {
    const fallback = new URL(url).searchParams.get('en');
    return (body || '').split(/\r?\n/).map(line => new URLSearchParams(line).get('en') || fallback).filter(Boolean);
  });
}
const reports=[];
for(const name of (process.env.QA_ENGINES||'chromium,webkit').split(',')){
  const engine=playwright[name];assert.ok(engine,`Unknown browser engine ${name}`);
  const browser=await engine.launch(name==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});
  const context=await browser.newContext({serviceWorkers:'block'});
  const requests=[],collects=[],unexpected=[],errors=[];
  try{
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin){
        const path=url.pathname.slice(1),body=path==='fixture.mjs'?fixtureModule:sources[path]||html;
        return route.fulfill({status:200,contentType:path.endsWith('.mjs')?'text/javascript':'text/html',body});
      }
      // Only the direct GA SDK for this deliberately nonexistent property may
      // reach Google. Never allow a GTM container, ads destination or real stream.
      if(url.hostname==='www.googletagmanager.com'&&/^\/gtag\/(?:js|destination)$/.test(url.pathname)&&url.searchParams.get('id')===measurementId){
        requests.push({type:'script',url:request.url(),referer:request.headers().referer||''});
        return route.continue();
      }
      if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/a') {
        // The SDK can attempt an additional request on this host. Count it
        // at every consent boundary and never let it leave the test browser.
        requests.push({ type: 'tag-request', url: request.url(), body: request.postData() || '', referer: request.headers().referer || '' });
        return route.fulfill({ status: 204 });
      }
      if(url.hostname==='google-analytics.com'||url.hostname.endsWith('.google-analytics.com')||url.hostname==='analytics.google.com'||url.hostname.endsWith('.analytics.google.com')){
        const collected={url:request.url(),body:request.postData()||'',referer:request.headers().referer||''};
        collects.push(collected);requests.push({type:'collect',...collected});
        return route.fulfill({status:204});
      }
      unexpected.push(url.origin+url.pathname);return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin,{referer:"https://referrer-fixture.invalid/PRIVATE_REFERRING_URL"});await page.waitForFunction(()=>window.analyticsReady===true);
    await page.evaluate(()=>initAnalytics(false));
    assert.equal(await page.evaluate(()=>api.consent('accepted')),false);
    await page.waitForTimeout(250);assert.equal(requests.length,0,'global disabled: no Google requests');
    await page.reload();await page.waitForFunction(()=>window.analyticsReady===true);
    assert.equal(await page.evaluate(()=>api.track('deck_created',{count:1})),false);
    await page.waitForTimeout(250);assert.equal(requests.length,0,'no choice: no Google requests');
    await page.evaluate(()=>api.consent('necessary'));
    await page.waitForTimeout(250);assert.equal(requests.length,0,'necessary only: no Google requests');
    assert.equal(await page.evaluate(()=>api.consent('accepted')),true);
    await page.waitForFunction(()=>api.track('deck_created',{count:1,source:'manual'}),null,{timeout:20_000});
    for(let attempt=0;attempt<100&&!collects.length;attempt++)await page.waitForTimeout(100);
    assert.ok(requests.some(request=>request.type==='script'),'the real SDK downloads after explicit fixture consent');
    assert.ok(collects.length>0,'the real SDK emits collection requests, intercepted before transmission');
    assert.ok(requests.every(request=>!request.referer),'outgoing browser referrers are empty');
    assert.ok(!/PRIVATE_|PRIVATE_EMAIL|PRIVATE_CARD_CONTENT|17ed1620/.test(JSON.stringify(collects)),'no title or free-text leakage');
    const parameters=collects.map(request=>({params:Object.fromEntries(new URL(request.url).searchParams),body:request.body}));
    assert.ok(parameters.some(request=>request.params.dl?.includes('/_usage/library')||request.body.includes('_usage%2Flibrary')),'synthetic generic page URL');
    assert.equal(await page.evaluate(()=>api.track('deck_created',{email:'PRIVATE_EMAIL@example.invalid'})),false);
    await page.evaluate(() => {
      api.navigate('library');
      api.navigate('library');
      history.replaceState(null, '', '/#legal=privacy');
      api.navigate('privacy');
      api.navigate('privacy');
    });
    for (let attempt = 0; attempt < 100 && eventNames(collects).filter(name => name === 'page_view').length < 2; attempt++) {
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(600);
    const names = eventNames(collects);
    assert.equal(names.filter(name => name === 'page_view').length, 2, 'one view per generic screen despite repeated navigation calls');
    assert.equal(names.filter(name => name === 'deck_created').length, 1, 'one event for the synthetic deck creation');

    const second=await context.newPage();second.on('pageerror',error=>errors.push(error.message));
    await second.goto(origin,{referer:'https://referrer-fixture.invalid/PRIVATE_REFERRING_URL'});await second.waitForFunction(()=>window.analyticsReady===true);
    await second.waitForFunction(()=>api.track('folder_created',{count:1}),null,{timeout:20_000});
    await page.waitForTimeout(1200);
    const beforeRevocation = requests.length;
    await page.evaluate(()=>api.revoke());
    // Both tabs perform the actual controlled reload, including the tab that
    // only received the browser's native cross-tab storage event.
    for(const target of [page,second])await target.waitForFunction(()=>window.analyticsReady===true&&window.analyticsFixtureWasReloaded&&api.readConsent()?.choice==='necessary');
    const after=collects.length;
    for(const target of [page,second])assert.equal(await target.evaluate(()=>api.track('deck_created',{count:1})),false);
    await page.waitForTimeout(1800);
    assert.equal(collects.length,after,'no subsequent collection after same-tab and cross-tab revocation');
    assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(),0);
    assert.equal(await second.locator('script[src*="googletagmanager.com"]').count(),0);
    assert.ok(!(await context.cookies()).some(cookie=>/^_ga/.test(cookie.name)),'GA cookies removed');
    assert.deepEqual(requests.slice(beforeRevocation).map(r=>({type:r.type,query:new URL(r.url).searchParams.get('en'),body:r.body?.slice(0,400)})),[],'including revocation reload, no new Google requests');
    await second.close();
    await page.close();
    // Use a fresh page for each boundary. A controlled reload must retain
    // the route/account that caused the tag to unload.
    const entries = [];
    for(const boundary of ['route','account']){
      const probe = await context.newPage();
      await probe.goto(origin);await probe.waitForFunction(()=>window.analyticsReady===true);
      await probe.evaluate(()=>api.consent('accepted'));
      await probe.waitForFunction(()=>api.track('folder_created',{count:1}),null,{timeout:20_000});
      await probe.waitForTimeout(1000);
      const beforeBoundary = requests.length;
      if(boundary==='route')await probe.evaluate(()=>{window.location.hash='privacy-action=delete';});
      else await probe.evaluate(()=>{
        sessionStorage.setItem('analytics-fixture-other','yes');
        const next={id:'PRIVATE_B',app_metadata:{privacy_analytics_grant:'292ff6d9-0000-4000-8000-000000000002'}};
        void api.updateAudience(next,async()=>next);
      });
      await probe.waitForFunction(()=>window.analyticsReady===true&&window.analyticsFixtureWasReloaded);
      if(boundary==='account')assert.equal(await probe.evaluate(()=>api.readConsent()),null,'next account must opt in separately');
      assert.equal(await probe.evaluate(()=>api.track('study_started')),false);
      await probe.waitForTimeout(450);
      assert.equal(await probe.locator('script[src*="googletagmanager.com"]').count(),0);
      assert.equal(requests.length,beforeBoundary,'no new Google request across '+boundary);
      entries.push(boundary);
      await probe.close();
    }

    const fallback = await context.newPage();
    fallback.on('pageerror',error=>errors.push(error.message));
    await fallback.goto(origin);
    await fallback.waitForFunction(()=>window.analyticsReady===true);
    assert.equal(await fallback.evaluate(()=>api.consent('accepted')),true);
    await fallback.waitForFunction(()=>api.track('folder_created',{count:1}),null,{timeout:20_000});
    const openTab = await context.newPage();
    openTab.on('pageerror',error=>errors.push(error.message));
    await openTab.goto(origin);
    await openTab.waitForFunction(()=>window.analyticsReady===true);
    await openTab.waitForFunction(()=>api.track('folder_created',{count:1}),null,{timeout:20_000});
    await fallback.waitForTimeout(1200);

    const staleRecord = await fallback.evaluate(key=>localStorage.getItem(key),consentKey);
    assert.equal(JSON.parse(staleRecord).choice,'accepted');
    const beforeFallback = requests.length;
    const revoked = await fallback.evaluate(key=>{
      const {setItem,removeItem}=Storage.prototype;
      Storage.prototype.setItem=function(name,value){
        if(this===localStorage&&name===key)throw new DOMException('Fixture blocks consent writes','QuotaExceededError');
        return setItem.call(this,name,value);
      };
      Storage.prototype.removeItem=function(name){
        if(this===localStorage&&name===key)throw new DOMException('Fixture blocks consent removal','SecurityError');
        return removeItem.call(this,name);
      };
      return api.revoke();
    },consentKey);
    assert.equal(revoked,true,'revocation persists despite unavailable consent writes');

    for(const target of [fallback,openTab]){
      await target.waitForFunction(()=>window.analyticsReady===true&&window.analyticsFixtureWasReloaded);
      assert.equal(await target.evaluate(key=>localStorage.getItem(key),consentKey),staleRecord);
      assert.equal(await target.evaluate(()=>api.readConsent()?.choice),'necessary');
      assert.equal(await target.evaluate(()=>api.track('deck_created',{count:1})),false);
      assert.equal(await target.locator('script[src*="googletagmanager.com"]').count(),0);
    }
    const reopened = await context.newPage();
    reopened.on('pageerror',error=>errors.push(error.message));
    await reopened.goto(origin);
    await reopened.waitForFunction(()=>window.analyticsReady===true);
    assert.equal(await reopened.evaluate(key=>localStorage.getItem(key),consentKey),staleRecord);
    assert.equal(await reopened.evaluate(()=>api.readConsent()?.choice),'necessary');
    assert.equal(await reopened.evaluate(()=>api.track('deck_created',{count:1})),false);
    assert.equal(await reopened.locator('script[src*="googletagmanager.com"]').count(),0);
    await reopened.waitForTimeout(1800);
    assert.equal(requests.length,beforeFallback,'no Google request after failed localStorage write/removal, including both reloads and an independent new tab');
    const cookies = await context.cookies(origin);
    assert.ok(!cookies.some(cookie=>/^_ga/.test(cookie.name)),'GA cookies removed after fallback revocation');
    const storedDenial = cookies.find(cookie=>cookie.name===choiceCookie);
    assert.ok(storedDenial,'a first-party opt-out survives fresh documents');
    assert.match(storedDenial.value,/^off\.\d+$/);
    assert.deepEqual({domain:storedDenial.domain,path:storedDenial.path,secure:storedDenial.secure,sameSite:storedDenial.sameSite},
      {domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'});
    assert.ok(storedDenial.expires>Date.now()/1000,'the fallback survives closing the browser');

    await context.clearCookies({name:choiceCookie});
    await reopened.reload();
    await reopened.waitForFunction(()=>window.analyticsReady===true);
    assert.equal(await reopened.evaluate(key=>localStorage.getItem(key),consentKey),staleRecord);
    assert.equal(await reopened.evaluate(()=>api.readConsent()),null,'the stale opt-in stays invalid when the browser drops the fallback cookie');
    assert.equal(await reopened.locator('script[src*="googletagmanager.com"]').count(),0);
    assert.equal(requests.length,beforeFallback);
    assert.equal(await reopened.evaluate(()=>api.consent('accepted')),true,'statistics requires a new explicit opt-in');
    assert.match((await context.cookies(origin)).find(cookie=>cookie.name===choiceCookie)?.value ?? '',/^on\.\d+$/);
    await reopened.waitForFunction(()=>api.track('folder_created',{count:1}),null,{timeout:20_000});
    for(const target of [fallback,openTab,reopened])await target.close();

    assert.ok(requests.every(request=>!request.referer),'no outgoing HTTP referrer in any browser phase');
    assert.ok(!/PRIVATE_|17ed1620|292ff6d9/.test(JSON.stringify(requests)),'all batches omit account, grant, titles, contents and the private referring URL');
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    reports.push({engine:name,preConsentRequests:0,deniedRequests:0,scriptRequests:requests.filter(request=>request.type==='script').length,
      interceptedCollectRequests:collects.length,postRevocationRequests:0,postFallbackRevocationRequests:0,privateBoundaries:entries,unexpected:unexpected.length});
    console.log(`PASS real SDK network ${name}: generic payloads; no requests before consent or after normal and fallback cross-tab revocation.`);
  }finally{await context.close();await browser.close();}
}
if(process.env.QA_ANALYTICS_RESULTS)await writeFile(process.env.QA_ANALYTICS_RESULTS,JSON.stringify(reports,null,2));
