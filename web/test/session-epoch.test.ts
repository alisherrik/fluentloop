import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionEpoch } from '../lib/session-epoch.ts';
test('late results are rejected after an account change, including switching back', () => {
  const epoch = new SessionEpoch();
  const a = epoch.snapshot();
  epoch.invalidate();
  assert.equal(epoch.current(a), false);
  const b = epoch.snapshot();
  epoch.invalidate();
  assert.equal(epoch.current(b), false);
  assert.equal(epoch.current(epoch.snapshot()), true);
});
