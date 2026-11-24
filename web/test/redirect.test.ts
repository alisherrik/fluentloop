import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../lib/redirect.ts';
test('allows local paths only', () => {
  assert.equal(safeNext('/dashboard?tab=one'), '/dashboard?tab=one');
  for (const value of [null, '', '//evil.example', '/\\evil.example', 'https://evil.example', '/%5cevil.example']) assert.equal(safeNext(value), '/');
});
