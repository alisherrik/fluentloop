import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCorrection, sameCorrection } from '../lib/correction.ts';

test('accepts and trims a complete correction', () => {
  assert.deepEqual(validateCorrection({ original: ' I goes ', corrected: ' I go ', explanation: ' Use go. ' }), { original: 'I goes', corrected: 'I go', explanation: 'Use go.' });
});
test('rejects empty, oversized, and unrelated inputs', () => {
  assert.equal(validateCorrection({ original: '', corrected: 'ok', explanation: 'why' }), null);
  assert.equal(validateCorrection({ original: 'x'.repeat(2001), corrected: 'ok', explanation: 'why' }), null);
  assert.equal(validateCorrection({ original: 'x', corrected: 'ok', explanation: 'why', transcript: 'secret' }), null);
});
test('duplicate request is successful only for the same stored correction', () => {
  const input = { original: 'I goes', corrected: 'I go', explanation: 'Use go.' };
  assert.equal(sameCorrection(input, { ...input }), true);
  assert.equal(sameCorrection(input, { ...input, corrected: 'different' }), false);
  assert.equal(sameCorrection(input, null), false);
});

