import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmission, withAdmission } from '../lib/mcp-admission.ts';

test('caps total verification starts within the window and reopens after it', () => {
  let now = 0;
  const gate = createAdmission({ maxStarts: 2, windowMs: 1000, maxInFlight: 2, now: () => now });
  const a = gate.enter(); assert.ok(a); a();
  const b = gate.enter(); assert.ok(b); b();
  assert.equal(gate.enter(), null);
  now = 1000;
  const c = gate.enter(); assert.ok(c); c();
});
test('limits simultaneous work, rejects without queuing and release is idempotent', () => {
  const gate = createAdmission({ maxStarts: 10, windowMs: 1000, maxInFlight: 1, now: () => 0 });
  const release = gate.enter(); assert.ok(release);
  assert.equal(gate.enter(), null);
  release(); release();
  const next = gate.enter(); assert.ok(next);
  assert.equal(gate.enter(), null);
  next();
});
test('rejects invalid settings and fails closed on clock errors', () => {
  assert.throws(() => createAdmission({ maxStarts: 0, windowMs: 1, maxInFlight: 1, now: () => 0 }));
  const gate = createAdmission({ maxStarts: 1, windowMs: 1, maxInFlight: 1, now: () => NaN });
  assert.equal(gate.enter(), null);
});
test('verification slot is released after both rejected and successful work', async () => {
  const gate = createAdmission({ maxStarts: 10, windowMs: 1000, maxInFlight: 1, now: () => 0 });
  await assert.rejects(() => withAdmission(gate, async () => { throw new Error('invalid token'); }), /invalid token/);
  assert.deepEqual(await withAdmission(gate, async () => 'ok'), { admitted: true, value: 'ok' });
  let finish: (() => void) | undefined;
  const running = withAdmission(gate, () => new Promise<void>(resolve => { finish = resolve; }));
  let executed = false;
  assert.deepEqual(await withAdmission(gate, async () => { executed = true; }), { admitted: false });
  assert.equal(executed, false);
  finish!();
  await running;
  assert.deepEqual(await withAdmission(gate, async () => 'again'), { admitted: true, value: 'again' });
});
