import assert from 'node:assert/strict';
import { validateClientEnv } from './vite.config.mjs';

const legacyKey = role => ['header', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'signature'].join('.');
for (const key of ['sb_publishable_fixture', legacyKey('anon')]) {
  validateClientEnv({ VITE_SUPABASE_URL: 'https://project.example', VITE_SUPABASE_PUBLISHABLE_KEY: key });
}
validateClientEnv({});
validateClientEnv({ VITE_SUPABASE_URL: 'http://localhost:54321' }, 'production');
validateClientEnv({ VITE_SUPABASE_URL: 'http://192.168.1.2:54321' }, 'development');
assert.throws(() => validateClientEnv({ VITE_SUPABASE_URL: 'http://project.example' }, 'production'), /HTTPS/);
assert.throws(() => validateClientEnv({ VITE_MISC: legacyKey('service_role') }), /VITE_MISC/);
for (const key of [legacyKey('service_role'), legacyKey('authenticated'), 'sb_secret_fixture', 'sk_live_fixture', 'whsec_fixture']) {
  assert.throws(() => validateClientEnv({ VITE_SUPABASE_ANON_KEY: key }), error =>
    error.message.includes('VITE_SUPABASE_ANON_KEY') && !error.message.includes(key));
}
for (const address of ['incomplete', 'ftp://project.example', 'https://user:pass@project.example', 'https://project.example/?token=fixture']) {
  assert.throws(() => validateClientEnv({ VITE_SUPABASE_URL: address }), /VITE_SUPABASE_URL/);
}
console.log('Public configuration checks passed.');
