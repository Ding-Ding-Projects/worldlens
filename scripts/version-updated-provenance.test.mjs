import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVersionUpdatedAt } from '../design/packages/app/build.mjs';
test('records the actual build event independently of source history', () => {
 assert.equal(resolveVersionUpdatedAt({}, () => '2026-10-11T12:30:01.000Z'), '2026-10-11T12:30:01.000Z');
});
test('explicit build provenance wins without reading the fallback clock', () => {
 assert.equal(resolveVersionUpdatedAt({WORLDLENS_BUILD_TIMESTAMP:'2026-10-10T01:02:03Z'}, () => {throw Error('Clock must not be read');}), '2026-10-10T01:02:03.000Z');
});
test('invalid declared or recorded instants stop the build', () => {
 assert.throws(() => resolveVersionUpdatedAt({WORLDLENS_BUILD_TIMESTAMP:'not a date'}));
 assert.throws(() => resolveVersionUpdatedAt({}, () => '2026-02-30T00:00:00.000Z'));
 assert.throws(() => resolveVersionUpdatedAt({}, () => 'not a date'));
});
