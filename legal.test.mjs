import assert from 'node:assert/strict';
import { legalConfig, contactEmail, legalPublicationIssues, legalPublicationReady } from './legal-config.mjs';
import { existsSync } from 'node:fs';
import { analyticsConfig } from './analytics-config.mjs';
import { readLegalPage, legalRouteHash, contactMailto } from './legal-ui.mjs';

assert.equal(legalConfig.appName,'Lernkarten Maker');
assert.equal(legalPublicationReady(),false,'unfinished legal texts cannot be published');
assert.ok(legalPublicationIssues().some(item=>item.includes('Minderjährig')));
const ready=structuredClone(legalConfig);
ready.operator={name:'Verantwortliche Testorganisation',street:'Testweg 1',postalCode:'1000',city:'Testort',email:'operator@example.org'};
ready.supportEmail='support@example.org';
ready.privacyEmail='privacy@example.org';
for(const key of Object.keys(ready.processing))ready.processing[key]=typeof ready.processing[key]==='boolean'?true:'Geprüfte Angabe für eine isolierte Textprüfung.';
ready.publication={...ready.publication,published:true,legallyReviewed:true};
ready.processing.googleAnalyticsTermsReviewed = false;
assert.equal(legalPublicationReady(ready),true,'A review of inactive analytics must not block the documents.');
if (existsSync(new URL('./legal-content.mjs', import.meta.url))) {
  const { legalDrafts, legalSources } = await import('./legal-content.mjs');
  const currentDrafts = legalDrafts();
  assert.ok(currentDrafts.privacy.sections.some(section => section.paragraphs.some(text => text.includes('[INTERN OFFEN:'))));
  assert.ok(currentDrafts.privacy.sections.find(section => section.title.endsWith('Nutzungsstatistik')).paragraphs[0].includes('ausgeschaltet'));
  assert.ok(currentDrafts.terms.sections.length >= 9);
  assert.ok(legalSources.every(source=>new URL(source.url).protocol==='https:'));
  const { privacy, terms, imprint } = legalDrafts(ready);
  const textOf = document => document.sections.flatMap(section => section.paragraphs).join(' ');
  const expectedAddress = 'Testweg 1, 1000 Testort, Schweiz';
  for (const document of [privacy, terms, imprint]) {
    const text = textOf(document);
    assert.ok(text.includes(ready.operator.name));
    assert.ok(text.includes(expectedAddress));
    assert.ok(!text.includes('[INTERN OFFEN:'));
  }
  const withAnalytics = legalDrafts(ready, { ...analyticsConfig, enabled: true, cookieExpiresSeconds: 86_400, consentMaxAgeDays: 30 }).privacy;
  assert.match(textOf(withAnalytics), /höchstens 1 Tag/);
  assert.match(textOf(withAnalytics), /Auswahl für 30 Tage im Browser/);
  assert.match(textOf(withAnalytics), /14 Monate für Ereignisdaten und 14 Monate für Daten auf Nutzerebene/);
  assert.match(textOf(withAnalytics), /Ein neues Ereignis startet die Frist für die pseudonyme Nutzerkennung erneut/);
  const fixedRetention = legalDrafts(ready, {
    ...analyticsConfig, enabled: true, retention: {eventMonths: 2, userMonths: 2, resetUserOnActivity: false}
  }).privacy;
  assert.match(textOf(fixedRetention), /Neue Aktivität startet die Frist für die pseudonyme Nutzerkennung nicht erneut/);
  assert.ok(textOf(privacy).includes(ready.privacyEmail));
  assert.ok(textOf(privacy).includes(ready.supportEmail));
  assert.match(textOf(privacy), /Ausk(unft|unftsbegehren).*Herausgabe/);
  assert.match(textOf(privacy), /Meldungen.*Support-Postfach/);
  assert.ok(textOf(terms).includes(ready.supportEmail));
  assert.ok(textOf(imprint).includes(ready.operator.email));
  assert.ok(textOf(imprint).includes(ready.website));
} else {
  console.log('Internal drafts are kept outside the public repository. Checking publication and contact logic.');
}
for(const key of Object.keys(ready.operator)){
  const invalid=structuredClone(ready);invalid.operator[key]='';assert.equal(legalPublicationReady(invalid),false,key);
}
for (const [key, value] of [['version', ''], ['updatedAt', '2026-02-31'], ['legallyReviewed', 'false']]) {
  const invalid = structuredClone(ready);
  invalid.publication[key] = value;
  assert.equal(legalPublicationReady(invalid), false, key);
}
for (const value of ['[INTERN OFFEN: Region]', 'noch festzulegen']) {
  const invalid = structuredClone(ready);
  invalid.processing.supabaseRegion = value;
  assert.equal(legalPublicationReady(invalid), false, value);
}
assert.equal(contactEmail(' support@example.org '),'support@example.org');
for(const value of ['',null,'a@example.org\r\nBcc:b@example.org','a@example.org?bcc=b@example.org','<x>@example.org','a@localhost','https://example.org','a%0ab@example.org','a@invalid-.org','a@sub..example.org'])assert.equal(contactEmail(value),'',String(value));
assert.equal(readLegalPage('#legal=privacy'),'privacy');
assert.equal(readLegalPage('#share=x&legal=contact'),'contact');
assert.equal(readLegalPage('#legal=__proto__'),null);
assert.equal(readLegalPage('#legal=unknown'),null);
assert.equal(readLegalPage('#legal=reports'),null);
assert.equal(legalRouteHash('cookies','#share=abc%2Bdef&mode=one+two'),'#share=abc%2Bdef&mode=one+two&legal=cookies');
assert.equal(legalRouteHash(null,'#share=abc%2Bdef&legal=cookies&mode=one+two'),'#share=abc%2Bdef&mode=one+two');
assert.equal(legalRouteHash(null,'#donations&legal=privacy'),'#donations');
assert.equal(legalRouteHash('terms','#legal=privacy&legal=imprint'),'#legal=terms');
assert.throws(()=>legalRouteHash('unknown'),TypeError);
assert.equal(contactMailto('','Allgemeine Fragen'),'');
assert.equal(contactMailto('support@example.org','unbekannt'),'');
const deletionMail = contactMailto('privacy@example.org', 'Kontolöschung anfragen');
assert.match(decodeURIComponent(deletionMail), /^mailto:privacy@example.org\?subject=Lernkarten Maker – Kontolöschung anfragen&body=$/);

const mail=contactMailto('support@example.org','Datenschutzanfragen','Keine automatische URL.\nNur meine Eingabe.');
assert.ok(mail.startsWith('mailto:support@example.org?subject='));
assert.ok(!mail.includes('#share=')&&!mail.includes('access_token'));
assert.equal(new URLSearchParams(mail.split('?')[1]).get('body'),'Keine automatische URL.\nNur meine Eingabe.');
console.log('Legal checks passed: publication blockers, operator data, draft completeness, safe contact links and legal/share route isolation.');
