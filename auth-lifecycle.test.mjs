import assert from 'node:assert/strict';
import { createAuthLifecycle } from './auth-lifecycle.mjs';

const session = (id, email = `${id}@example.test`) => ({ user: { id, email } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(overrides = {}) {
  const events = [], calls = { load: 0, reload: 0, reset: 0 };
  const lifecycle = createAuthLifecycle({
    loadApp: async () => { calls.load++; await overrides.load?.(); },
    reloadApp: async () => { calls.reload++; await overrides.reload?.(); },
    updateAccount: user => events.push(`account:${user.email}`),
    showLoading: () => events.push('loading'),
    showSignedIn: () => events.push('signed-in'),
    showSignedOut: message => events.push(`signed-out:${message}`),
    resetWorkspace: () => { calls.reset++; },
    onError: error => events.push(`error:${error.message}`)
  });
  return { ...lifecycle, events, calls };
}

// Token refresh, tab refocus SIGNED_IN and profile updates preserve the workspace
// and drafts while still refreshing the displayed account information.
const stable = harness();
await stable.apply(session('a'));
await stable.apply(session('a'));
await stable.apply(session('a', 'updated@example.test'));
assert.deepEqual(stable.calls, { load: 1, reload: 0, reset: 0 });
assert.equal(stable.events.filter(event => event === 'signed-in').length, 1);
assert.equal(stable.events.at(-1), 'account:updated@example.test');
await stable.apply(null);
await stable.apply(session('a'));
assert.deepEqual(stable.calls, { load: 1, reload: 1, reset: 1 });
await stable.apply(session('b'));
assert.deepEqual(stable.calls, { load: 1, reload: 2, reset: 2 });

// An initial load completing after logout must never expose the old workspace.
const firstLoad = deferred(), signedOut = harness({ load: () => firstLoad.promise });
const pending = signedOut.apply(session('a'));
await Promise.resolve();
await signedOut.apply(null, 'Abgemeldet');
firstLoad.resolve();
await pending;
assert.equal(signedOut.events.includes('signed-in'), false);
assert.equal(signedOut.events.at(-1), 'signed-out:Abgemeldet');

// Overlapping same-user notifications share one initial import.
const sharedLoad = deferred(), sameUser = harness({ load: () => sharedLoad.promise });
const first = sameUser.apply(session('a'));
const second = sameUser.apply(session('a'));
sharedLoad.resolve();
await Promise.all([first, second]);
assert.deepEqual(sameUser.calls, { load: 1, reload: 0, reset: 0 });
assert.equal(sameUser.events.filter(event => event === 'signed-in').length, 1);

// Only the most recent identity may finish a reload or surface a load error.
const reloads = [];
const switching = harness({ reload: () => { const next = deferred(); reloads.push(next); return next.promise; } });
await switching.apply(session('a'));
await switching.apply(null);
const oldReload = switching.apply(session('a'));
await Promise.resolve();
const newReload = switching.apply(session('b'));
await Promise.resolve();
reloads[1].resolve();
await newReload;
const shownCount = switching.events.filter(event => event === 'signed-in').length;
reloads[0].reject(new Error('old user network failure'));
await oldReload;
assert.equal(switching.events.filter(event => event === 'signed-in').length, shownCount);
assert.equal(switching.events.some(event => event.startsWith('error:')), false);

let fail = true;
const retry = harness({ load: () => { if (fail) throw new Error('offline'); } });
await retry.apply(session('a'));
assert.equal(retry.events.at(-1), 'error:offline');
fail = false;
await retry.apply(session('a'));
assert.equal(retry.events.at(-1), 'signed-in');
assert.equal(retry.calls.load, 2);
console.log('Auth lifecycle checks passed: session refresh, duplicate events, logout, account switches, stale loads and recovery.');
