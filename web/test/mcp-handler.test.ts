import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp } from '../lib/mcp-handler.ts';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
function req(method, params) { return new Request('https://example.test/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); }
test('SDK advertises one narrowly scoped save tool', async () => {
  const res = await handleMcp(req('tools/list', {}), { save: async () => { throw new Error('unexpected'); } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name), ['save_correction']);
});
test('SDK rejects upload without explicit consent', async () => {
  let writes = 0;
  const res = await handleMcp(req('tools/call', { name: 'save_correction', arguments: { original: 'I goes', corrected: 'I go', explanation: 'Use go', request_id: '67e55044-10b1-426f-9247-bb680e5fe0c8' } }), { save: async () => { writes++; return { id: 1, created_at: 'now' }; } });
  const body = await res.json();
  assert.equal(body.result.isError, true); assert.equal(writes, 0);
});
test('SDK sends only explicitly approved correction fields to the injected store', async () => {
  let saved;
  const input = { original: 'I goes', corrected: 'I go', explanation: 'Use go', request_id: '67e55044-10b1-426f-9247-bb680e5fe0c8', consent: true };
  const res = await handleMcp(req('tools/call', { name: 'save_correction', arguments: input }), { save: async (value) => { saved = value; return { id: 12, created_at: 'now' }; } });
  const body = await res.json();
  assert.deepEqual(saved, input); assert.equal(body.result.structuredContent.id, 12);
});
test('SDK rejects forged identity, malformed request IDs and unrelated data without writing', async () => {
  let writes = 0;
  const input = { original: 'I goes', corrected: 'I go', explanation: 'Use go', request_id: '67e55044-10b1-426f-9247-bb680e5fe0c8', consent: true };
  for (const args of [
    { ...input, user_id: '00000000-0000-4000-8000-000000000001' },
    { ...input, request_id: 'invalid' },
    { ...input, source_code: 'must not upload' },
    { ...input, original: '   ' }
  ]) {
    const res = await handleMcp(req('tools/call', { name: 'save_correction', arguments: args }), { save: async () => { writes++; return { id: 1, created_at: 'now' }; } });
    assert.equal((await res.json()).result.isError, true);
  }
  assert.equal(writes, 0);
});
