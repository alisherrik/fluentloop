import test from 'node:test';
import assert from 'node:assert/strict';
import { unavailable } from '../lib/mcp-unavailable.ts';

test('MCP endpoint fails closed without credentials', async () => {
  const response = unavailable();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'mcp_not_configured' });
});
import { POST } from '../app/mcp/route.ts';
test('public route stays disabled even when handed an authorization header', async () => {
  const request = new Request('https://example.test/mcp', { method: 'POST', headers: { Authorization: 'Bearer arbitrary' } });
  const response = POST(request);
  assert.equal(response.status, 503);
});

import { GET as metadata } from '../app/.well-known/oauth-protected-resource/mcp/route.ts';
test('protected resource metadata stays disabled even when MCP environment flags are set', async () => {
  const keys=['MCP_ENABLED','SUPABASE_SECRET_KEY','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_SUPABASE_URL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    process.env.MCP_ENABLED='true'; process.env.SUPABASE_SECRET_KEY='synthetic';
    process.env.NEXT_PUBLIC_SITE_URL='https://app.example'; process.env.NEXT_PUBLIC_SUPABASE_URL='https://db.example';
    assert.equal(metadata().status,503);
  } finally { for(const key of keys) { const value=previous[key]; if(value===undefined) delete process.env[key]; else process.env[key]=value; } }
});
