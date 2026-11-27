import assert from 'node:assert/strict';
import { analyticsConfig } from './analytics-config.mjs';
import { ANALYTICS_CONSENT_KEY, createAnalyticsController } from './analytics.mjs';

const approved = { ...analyticsConfig, enabled: true, legalApproved: true, minorsEligibilityVerified: true,
  enhancedMeasurementVerifiedDisabled: true, advertisingAndSharingVerifiedDisabled: true, cookieExpiresSeconds: 3600, consentMaxAgeDays: 1 };
const runtime = { productionBuild: true, deploymentEnvironment: 'production' };
const origin = 'https://lernkarte-maker.vercel.app';
const choiceCookie = '__Host-lernkarten-statistics-choice';
const verified = {id: 'test-user', app_metadata: {privacy_analytics_grant: '42deb866-0000-4321-8123-000000000001'}};
async function fixture({ config = approved, url = origin, saved, savedCookie = saved?.choice === 'accepted' ? `on.${Date.parse(saved.updatedAt)}` : null, clock = Date.parse('2026-11-25T12:00:00Z'), storageFailure = false, readOnly = false, environment = runtime, legalReady = true, audience = verified } = {}) {
  const values = new Map(saved ? [[ANALYTICS_CONSENT_KEY, JSON.stringify(saved)]] : []);
  const storage = {
    getItem(key) { if (storageFailure) throw Error(); return values.get(key) ?? null; },
    setItem(key, value) { if (storageFailure || readOnly) throw Error(); values.set(key, value); },
    removeItem(key) { if (storageFailure || readOnly) throw Error(); values.delete(key); }
  };
  const cookies = new Map([['_ga','123'],['_ga_LW1QZY0HMD','456'],['sb-project-auth-token','PRIVATE_SESSION'],['theme','dark']]);
  if (savedCookie) cookies.set(choiceCookie, savedCookie);
  let blockCookieWrites = false;
  const deleted = [], scripts = [], timers = new Map(), listeners = new Map(), reloads = [];
  let nextTimer = 0;
  const win = {
    location: new URL(url), localStorage: storage,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, {fn, at:clock+ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }
  };
  const doc = {
    title: 'PRIVATE_DECK_NAME private@example.invalid',
    get cookie() { return [...cookies].map(([key,value])=>`${key}=${value}`).join('; '); },
    set cookie(value) {
      if (blockCookieWrites) return;
      deleted.push(value);
      const [pair] = value.split(';');
      const [name, contents] = pair.split('=');
      if (value.includes('Max-Age=0')) cookies.delete(name);
      else cookies.set(name, contents);
    },
    head: { append(script) { if(script.tagName!=='META')scripts.push(script); } },
    createElement(type) { if(type==='meta')return {tagName:'META'};assert.equal(type,'script');return { remove() { this.removed = true; } }; },
    querySelector() { return scripts.find(script=>!script.removed) || null; }
  };
  const api = createAnalyticsController({window:win,document:doc,storage,config,legalReady,runtime:environment,now:()=>clock,
    reload() { reloads.push({disabled:win[`ga-disable-${config.measurementId}`],choice:api.readConsent(),cookieNames:[...cookies.keys()]}); }});
  if (audience) await api.updateAudience(audience, async () => audience);
  return {api,win,doc,storage,values,cookies,deleted,scripts,timers,reloads,listeners,
    blockCookieWrites() { blockCookieWrites = true; },
    load() { scripts.at(-1)?.onload?.(); },
    commands() { return win.dataLayer || []; },
    events() { return (win.dataLayer || []).filter(command=>command[0]==='event'); },
    event(type, details={}) { for(const listener of listeners.get(type)||[])listener({type,...details}); },
    advance(ms) { clock+=ms;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();} }
  };
}
const record = choice => ({...(choice === 'accepted' ? {grant:verified.app_metadata.privacy_analytics_grant} : {}),version:approved.consentVersion,choice,updatedAt:'2026-11-25T12:00:00.000Z'});

assert.equal(analyticsConfig.enabled,false);assert.equal(analyticsConfig.legalApproved,false);
assert.equal(analyticsConfig.minorsEligibilityVerified,false);assert.equal(analyticsConfig.enhancedMeasurementVerifiedDisabled,false);
assert.equal(analyticsConfig.advertisingAndSharingVerifiedDisabled, false);
assert.equal(analyticsConfig.cookieExpiresSeconds,180 * 86_400);assert.equal(analyticsConfig.consentMaxAgeDays,180);
for(const [key,value]of [['enabled',false],['legalApproved',false],['minorsEligibilityVerified',false],['enhancedMeasurementVerifiedDisabled',false],['advertisingAndSharingVerifiedDisabled',false],['cookieExpiresSeconds',null],['cookieExpiresSeconds',86_401],['consentMaxAgeDays',null]]){
  const f=await fixture({config:{...approved,[key]:value},saved:record('accepted')});f.api.navigate('library');
  assert.equal(f.api.isAvailable(),false,key);assert.equal(f.scripts.length,0);assert.equal(f.api.consent('accepted'),false);f.api.dispose();
}
{
  const f = await fixture({ saved: record('accepted'), clock: Date.parse('2026-11-26T11:50:00Z') });
  f.api.navigate('library');
  assert.equal(f.commands().find(command => command[0] === 'config')[2].cookie_expires, 600);
  f.load();
  f.api.suspend({ reloadPage: false });
  assert.equal(f.scripts[0].removed, true);
  assert.equal(f.api.track('deck_created'), false);
  assert.equal(f.reloads.length, 0, 'leaving for OAuth must not reload the previous page');
  assert.equal(f.api.readConsent().choice, 'accepted', 'a navigation stop does not rewrite the consent choice');
  f.api.dispose();
}
{
  const f = await fixture({ saved: record('accepted'), clock: Date.parse('2026-11-26T11:59:59.500Z') });
  f.api.navigate('library');
  assert.equal(f.scripts.length, 0, 'sub-second consent must not fall back to session cookies');
  f.api.dispose();
}
for(const environment of [{productionBuild:false,deploymentEnvironment:'production'},{productionBuild:true,deploymentEnvironment:'preview'},{productionBuild:true,deploymentEnvironment:undefined}]){
  const f=await fixture({environment,saved:record('accepted')});f.api.navigate('library');assert.equal(f.api.isAvailable(),false);assert.equal(f.scripts.length,0);f.api.dispose();
}
for(const url of ['http://lernkarte-maker.vercel.app','https://preview.vercel.app','http://localhost:5173']){
  const f=await fixture({url,saved:record('accepted')});f.api.navigate('library');assert.equal(f.api.isAvailable(),false);assert.equal(f.scripts.length,0);f.api.dispose();
}
for(const url of [`${origin}/?code=SECRET`,`${origin}/#share=${'a'.repeat(64)}`,`${origin}/#access_token=SECRET`,`${origin}/#privacy-action=delete`,`${origin}/#legal=report`,`${origin}/#legal=reports`,`${origin}/#legal=cookies`,`${origin}/account`,`${origin}/password/reset`,`${origin}/#unknown=PRIVATE`]){
  const f=await fixture({url,saved:record('accepted')});f.api.navigate('library');assert.equal(f.scripts.length,0,url);f.api.dispose();
}
for(const page of ['privacy','terms','imprint','contact']){
  const f=await fixture({url:`${origin}/#legal=${page}`,saved:record('accepted')});f.api.navigate(page);assert.equal(f.scripts.length,1);f.load();assert.equal(f.events()[0][2].page_name,page);f.api.dispose();
}
{
  const f=await fixture();assert.equal(f.api.readConsent(),null);f.api.navigate('library');
  assert.equal(f.scripts.length,0);assert.equal(f.api.track('deck_created'),false);assert.equal(f.win.dataLayer,undefined);
  assert.equal(f.api.consent('necessary'),true);assert.equal(f.api.readConsent().choice,'necessary');assert.equal(f.scripts.length,0);
  assert.equal(f.api.consent('invalid'),false);assert.equal(f.api.consent('accepted'),true);assert.equal(f.scripts.length,1);
  assert.equal(f.scripts[0].src,`https://www.googletagmanager.com/gtag/js?id=${approved.measurementId}`);
  assert.equal(f.scripts[0].referrerPolicy,'no-referrer');assert.equal(f.scripts[0].async,true);
  assert.equal(f.api.track('flashcard_created',{count:2}),false,'no actions buffered while loading');
  f.api.navigate('subject');f.load();assert.deepEqual(f.events().map(event=>event[2].page_name),['subject'],'only current generic page at activation');
  assert.equal(f.api.navigate('subject'),false);assert.equal(f.api.track('page_view'),false);
  assert.equal(f.api.navigate('folder'),true);assert.equal(f.api.track('flashcard_created',{count:2,source:'text',format:'plain'}),true);
  for(const args of [ ['private_event',{}],['deck_created',{name:'PRIVATE'}],['deck_created',{user_id:'uuid'}],['deck_created',{source:'private@example.invalid'}],['deck_created',{count:1.5}],['deck_created',{count:-1}],['deck_created',{count:1_000_001}],['deck_created',{count:NaN}],['deck_created',[]],['deck_created',null] ])assert.equal(f.api.track(...args),false);
  assert.equal(f.api.track('deck_created',{get count(){throw Error('must not execute getter');}}),false);
  assert.ok(f.events().every(event => event[2].send_to === approved.measurementId), 'events target only the configured stream');
  assert.equal(f.api.track('deck_created', { send_to: 'G-UNEXPECTED' }), false);
  const config=f.commands().find(command=>command[0]==='config')[2];
  assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);
  assert.equal(config.page_referrer,'');assert.equal(config.ignore_referrer,true);assert.equal(config.cookie_update,false);
  for(const command of f.commands().filter(command=>command[0]==='consent'))for(const key of ['ad_storage','ad_user_data','ad_personalization'])assert.equal(command[2][key],'denied');
  const serialized=JSON.stringify(f.commands());assert.ok(!/PRIVATE|private@example|access_token|refresh_token|user_id|user_properties|42deb866|test-user/.test(serialized));
  assert.deepEqual(Object.keys(JSON.parse(f.values.get(ANALYTICS_CONSENT_KEY))).sort(),['choice','grant','updatedAt','version']);
  const count=f.events().length;assert.ok(count>=3);
  assert.equal(f.api.revoke(),true);assert.equal(f.api.track('folder_created'),false);assert.equal(f.win[`ga-disable-${approved.measurementId}`],true);
  assert.equal(f.commands().length,0,'no denied-consent ping queued');assert.equal(f.reloads.length,1);
  assert.equal(f.reloads[0].choice.choice,'necessary','choice persisted before controlled reload');assert.equal(f.reloads[0].disabled,true);
  assert.deepEqual([...f.cookies.keys()].sort(),['sb-project-auth-token','theme']);assert.ok(f.deleted.some(value=>value.includes('Path=/;')));
  assert.equal(f.api.consent('accepted'),false,'do not reactivate an old tag while reload is pending');f.api.dispose();
}
{
  const f=await fixture({saved:record('accepted')});f.api.navigate('deck');f.load();
  f.storage.setItem(ANALYTICS_CONSENT_KEY,JSON.stringify(record('necessary')));
  f.event('storage',{key:ANALYTICS_CONSENT_KEY,storageArea:f.storage});
  assert.equal(f.reloads.length,1);assert.equal(f.api.track('deck_created'),false);assert.equal(f.commands().length,0);f.api.dispose();
}
{
  const f=await fixture({saved:record('accepted')});f.api.navigate('library');f.load();
  f.win.location=new URL(`${origin}/#privacy-action=delete`);f.event('hashchange');
  assert.equal(f.reloads.length,1);assert.equal(f.api.track('export_completed'),false,'no events on rights screens');f.api.dispose();
}
{
  const f=await fixture({saved:record('accepted')});f.api.navigate('account');assert.equal(f.scripts.length,0);
  f.api.navigate('library');assert.equal(f.scripts.length,1,'safe navigation can activate after a never-tracked login view');f.api.dispose();
}
{
  const f=await fixture({saved:record('accepted')});f.api.navigate('library');f.load();f.advance(86_400_001);
  assert.equal(f.api.readConsent(),null);assert.equal(f.reloads.length,1,'expiry stops automatic tag activity');assert.equal(f.api.track('deck_created'),false);f.api.dispose();
}
for(const saved of [{...record('accepted'),version:'old'},{...record('accepted'),updatedAt:'2027-01-01T00:00:00Z'},{...record('accepted'),updatedAt:'bad'},{...record('accepted'),choice:true}]){
  const f=await fixture({saved});f.api.navigate('library');assert.equal(f.api.readConsent(),null);assert.equal(f.scripts.length,0);f.api.dispose();
}
{
  const f=await fixture({storageFailure:true});f.api.navigate('library');assert.equal(f.api.consent('accepted'),false);assert.equal(f.scripts.length,0);assert.equal(f.win[`ga-disable-${approved.measurementId}`],true);f.api.dispose();
}
{
  const f = await fixture({saved:record('accepted')});
  f.api.navigate('library');
  f.load();
  f.storage.setItem = () => { throw new Error('Storage full'); };
  f.blockCookieWrites();
  assert.equal(f.api.revoke(),true);
  assert.ok(!f.values.has(ANALYTICS_CONSENT_KEY), 'failed writes should still remove the stored opt-in');
  assert.equal(f.reloads.length,1);
  f.api.dispose();
}
{
  const f = await fixture({saved:record('accepted')});
  f.api.navigate('library');
  f.load();
  f.storage.setItem = () => { throw new Error('Storage blocked'); };
  f.storage.removeItem = () => { throw new Error('Storage blocked'); };
  f.blockCookieWrites();
  assert.equal(f.api.revoke(),false);
  assert.equal(f.api.readConsent(),null);
  assert.equal(f.reloads.length,0,'do not reload into an unreplaced opt-in record');
  assert.equal(f.api.track('study_completed'), false);
  f.api.dispose();
}
{
  const f = await fixture({saved:record('accepted'),readOnly:true});
  f.api.navigate('library');
  assert.equal(f.scripts.length,0,'old choice cannot load the tag after reopening a read-only browser');
  assert.equal(f.api.readConsent(),null);
  f.api.dispose();
}
{
  const f = await fixture({saved:record('accepted'),savedCookie:null});
  f.api.navigate('library');
  assert.equal(f.scripts.length,0,'a remaining opt-in cannot start the tag after the choice cookie disappears');
  assert.equal(f.api.readConsent(),null);
  f.api.dispose();
}
{
  const f=await fixture();let updates=0;const unsubscribe=f.api.subscribe(()=>updates++);f.api.consent('necessary');assert.equal(updates,1);unsubscribe();f.api.consent('necessary');assert.equal(updates,1);
  f.api.dispose();assert.ok([...f.listeners.values()].every(set=>set.size===0));assert.equal(f.timers.size,0);
}
{
  const alternate = {id:'another-person', app_metadata:{privacy_analytics_grant:'492ff6d9-0000-4000-8000-000000000002'}};
  const f = await fixture({audience:null,saved:record('accepted')});
  f.api.navigate('library');
  assert.equal(f.api.isAvailable(),false);
  assert.equal(f.api.consent('accepted'),false);
  assert.equal(f.api.readConsent(),null,'unknown audiences never inherit a device opt-in');
  let checks = 0;
  await f.api.updateAudience({id:'x',user_metadata:verified.app_metadata},() => {checks++;return verified;});
  assert.equal(checks,0,'user-editable metadata cannot grant eligibility');
  assert.equal(await f.api.updateAudience(verified,async()=>({...verified,app_metadata:{}})),false);
  assert.equal(await f.api.updateAudience(verified,async()=>alternate),false);
  assert.equal(f.scripts.length,0);
  await f.api.updateAudience(verified, async()=>verified);
  assert.equal(f.scripts.length,1);
  f.load();
  await f.api.updateAudience(alternate, async()=>alternate);
  assert.equal(f.reloads.length,1,'account switch disables active Google code');
  assert.equal(f.api.readConsent(),null);
  assert.equal(f.api.track('deck_created'),false);
  f.api.dispose();
  const g=await fixture({saved:record('accepted')});
  g.api.navigate('library');g.load();
  await g.api.updateAudience(verified,async()=>({...verified,app_metadata:{}}));
  assert.equal(g.reloads.length,1,'revoked clearance immediately unloads an active tag');
  assert.equal(g.api.isAvailable(),false);
  g.api.dispose();
}
{
  const f=await fixture({legalReady:false});
  let checks=0;
  assert.equal(await f.api.updateAudience(verified,async()=>{checks++;return verified;}),false);
  assert.equal(checks,0,'disabled deployments require no extra Auth request');
  assert.equal(f.api.isAvailable(),false);f.api.dispose();
}
{
  const f=await fixture({audience:null});
  let resolve;
  const older=f.api.updateAudience(verified,()=>new Promise(done=>{resolve=done;}));
  await f.api.updateAudience(null);resolve(verified);
  assert.equal(await older,false,'an old Auth response cannot re-enable tracking');
  f.api.dispose();
}
console.log('Analytics checks passed: fail-closed activation, Basic Consent, no pre-consent queue, strict payload allowlists, generic pages, sensitive routes, revocation/reload, cross-tab changes, expiry and storage failures.');
