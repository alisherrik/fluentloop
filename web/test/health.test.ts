import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/health/route.ts';
test('health endpoint reports process availability without caching', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'fluentloop' });
});
