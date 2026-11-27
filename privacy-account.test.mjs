import assert from 'node:assert/strict';
import { clearDeletedAccountStorage, requestAccountDeletion } from './privacy-account.mjs';
const memory=values=>{const map=new Map(Object.entries(values));return {getItem:key=>map.get(key)??null,removeItem:key=>map.delete(key)};};
const own=memory({'wortwerk-library-v1:own':'MY WORK','wortwerk-library-v1:own:pending':'MY DRAFT','wortwerk-library-v1:other:pending':'KEEP','wortwerk-library-v1:migrated':'other','wortwerk-library-v1':'KEEP LEGACY','sb-project-auth-token':JSON.stringify({user:{id:'own'}}),'sb-project-auth-token-code-verifier':'VERIFIER'});
clearDeletedAccountStorage(own,'own','sb-project-auth-token');
assert.equal(own.getItem('wortwerk-library-v1:own:pending'),null);
assert.equal(own.getItem('sb-project-auth-token'),null);
assert.equal(own.getItem('wortwerk-library-v1:other:pending'),'KEEP');
assert.equal(own.getItem('wortwerk-library-v1'),'KEEP LEGACY');
clearDeletedAccountStorage(own,'other',null);assert.equal(own.getItem('wortwerk-library-v1'),null);
const shared = memory({'sb-project-auth-token':JSON.stringify({user:{id:'other'}}),'sb-project-auth-token-code-verifier':'OTHER PKCE'});
clearDeletedAccountStorage(shared,'own','sb-project-auth-token');
assert.ok(shared.getItem('sb-project-auth-token'));
assert.equal(shared.getItem('sb-project-auth-token-code-verifier'),'OTHER PKCE');
const session = { user: { id: 'own' }, access_token: 'test-token' };
await assert.rejects(() => requestAccountDeletion(null, {
  fetcher() { assert.fail('An unauthenticated request must never be sent'); }
}), /melde dich an/);
const readiness = await requestAccountDeletion(session, {
  async fetcher(path, options) {
    assert.equal(path, '/api/delete-account');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return new Response('{"available":true}');
  }
});
assert.deepEqual(readiness, { available: true });
await assert.rejects(() => requestAccountDeletion(session, {
  confirmation: 'KONTO LÖSCHEN',
  async fetcher(path, options) {
    assert.equal(path, '/api/delete-account');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { confirmation: 'KONTO LÖSCHEN' });
    return new Response('{"code":"REAUTH_REQUIRED","error":"Erneut anmelden"}', { status: 401 });
  }
}), { code: 'REAUTH_REQUIRED' });
await assert.rejects(() => requestAccountDeletion(session, {
  fetcher: async () => new Response('not JSON', { status: 200 })
}), /nicht abgeschlossen/);
console.log('Account deletion checks passed: account-isolated cleanup, fixed endpoint and honest failures.');
