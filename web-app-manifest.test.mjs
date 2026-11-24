import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicDirectory = new URL('./public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', publicDirectory), 'utf8'));
const document = await readFile(new URL('./index.html', import.meta.url), 'utf8');

assert.match(document, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?\s*>/);
assert.match(document, /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="\/icons\/apple-touch-icon\.png"\s*\/?\s*>/);

// App identity must remain independent from login callbacks and shared tokens.
assert.equal(manifest.id, '/');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.prefer_related_applications, false);
assert.ok(manifest.name.length > 0);
assert.ok(manifest.short_name.length > 0);
assert.equal(manifest.lang, 'de-CH');

async function pngDimensions(path) {
  const png = await readFile(new URL(path.replace(/^\//, ''), publicDirectory));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
for (const icon of manifest.icons) {
  assert.ok(icon.src.startsWith('/icons/'));
  assert.equal(icon.type, 'image/png');
  assert.equal(icon.purpose, 'any');
  assert.equal(await pngDimensions(icon.src), icon.sizes);
}
assert.equal(await pngDimensions('/icons/apple-touch-icon.png'), '180x180');

console.log('Web app manifest checks passed: stable identity, standalone launch and valid Android/desktop/Apple icons.');
