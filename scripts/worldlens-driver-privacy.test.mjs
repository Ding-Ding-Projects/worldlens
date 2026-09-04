import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { publicRendererUrl } from '../.claude/skills/run-worldlens/safe-url.mjs';

test('capture URLs omit user information, all query fields and fragments', () => {
  assert.equal(publicRendererUrl('http://user:fixture@127.0.0.1:1234/map/?token=fixture&other=private#secret'), 'http://127.0.0.1:1234/map/');
  assert.equal(publicRendererUrl('https://127.0.0.1:1234/'), 'https://127.0.0.1:1234/');
});

test('invalid and unsupported URL diagnostics cannot reflect input', () => {
  assert.equal(publicRendererUrl('fixture-private-value'), '[invalid renderer URL]');
  assert.equal(publicRendererUrl('data:text/plain,fixture-private-value'), '[unsupported renderer URL]');
});

test('driver routes every URL output through redaction and checks the complete target inventory', () => {
  const source = readFileSync(new URL('../.claude/skills/run-worldlens/driver.mjs', import.meta.url), 'utf8');
  assert.match(source, /targetUrl: publicRendererUrl\(pageUrl.href\)/);
  assert.match(source, /url: async \(\) => out\(publicRendererUrl\(page.url\(\)\)\)/);
  assert.match(source, /out\(`attached \$\{publicRendererUrl\(page.url\(\)\)\}`\)/);
  assert.match(source, /targetInventory.length !== 1/);
  assert.match(source, /pageUrl.href !== expectedRendererUrl.href/);
  assert.doesNotMatch(source, /targetUrl: pageUrl.href|out\(page.url\(\)\)|\$\{pageUrl.href\}/);
});
