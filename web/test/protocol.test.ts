import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, type CorrectionInput } from '../lib/mcp-server.ts';
import { handleMcp } from '../lib/mcp-handler.ts';

const correction: CorrectionInput = { original: 'I goes', corrected: 'I go', explanation: 'Use go with I.', request_id: '33333333-3333-4333-8333-333333333333', consent: true };
test('real MCP client initializes, lists only the upload tool, and saves a correction', async () => {
  const saved: CorrectionInput[] = [];
  const server = createMcpServer({ save: async input => { saved.push(input); return { id: 42, created_at: '2026-11-03T00:00:00Z' }; } });
  const client = new Client({ name: 'test-codex', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport); await client.connect(clientTransport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['save_correction']);
    const response = await client.callTool({ name: 'save_correction', arguments: correction });
    assert.equal(response.isError, undefined); assert.deepEqual(saved, [correction]);
    const denied = await client.callTool({ name: 'save_correction', arguments: { ...correction, consent: false } });
    assert.equal(denied.isError, true); assert.equal(saved.length, 1);
    const extra = await client.callTool({ name: 'save_correction', arguments: { ...correction, transcript: 'must not upload' } });
    assert.equal(extra.isError, true); assert.equal(saved.length, 1);
    const oversized = await client.callTool({ name: 'save_correction', arguments: { ...correction, original: 'x'.repeat(2001) } });
    assert.equal(oversized.isError, true); assert.equal(saved.length, 1);
  } finally { await client.close(); await server.close(); }
});
test('database denial returns a safe MCP error without leaking internals', async () => {
  const server = createMcpServer({ save: async () => { throw new Error('SECRET database connection string'); } });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b); await client.connect(a);
    const response = await client.callTool({ name: 'save_correction', arguments: correction });
    assert.equal(response.isError, true); assert.doesNotMatch(JSON.stringify(response), /SECRET/);
  } finally { await client.close(); await server.close(); }
});
test('web-standard HTTP transport completes actual MCP initialize and tools/list', async () => {
  for (const request of [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }]) {
    const response = await handleMcp(new Request('http://localhost:3000/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(request) }), { save: async () => ({ id: 1, created_at: '' }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, request.id); assert.ok(body.result);
  }
});
