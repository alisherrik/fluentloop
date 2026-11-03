import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { verifyMcpToken } from '../lib/mcp-token.ts';
import { mcpConfig, siteOrigin } from '../lib/config.ts';

const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const config = { resource: 'https://app.example/mcp', issuer: 'https://db.example/auth/v1', jwks: new URL('https://db.example/auth/v1/.well-known/jwks.json'), supabaseUrl: 'https://db.example', publishableKey: 'test-only' };
const key = await generateKeyPair('ES256');
const publicJwk = await exportJWK(key.publicKey);
const keys = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'trusted', alg: 'ES256' }] });
async function signed(changes: Record<string, unknown> = {}, privateKey = key.privateKey) {
  return new SignJWT({ iss: config.issuer, aud: config.resource, sub: user, client_id: '33333333-3333-4333-8333-333333333333', session_id: session, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, iat: Math.floor(Date.now() / 1000), ...changes }).setProtectedHeader({ alg: 'ES256', kid: 'trusted' }).sign(privateKey);
}
test('verifies signature, issuer, canonical audience and required native session identity', async () => {
  assert.deepEqual(await verifyMcpToken(await signed(), config, keys), { userId: user, clientId: '33333333-3333-4333-8333-333333333333', sessionId: session });
});
test('rejects wrong signatures, generic login tokens, wrong issuer and expired tokens', async () => {
  const attacker = await generateKeyPair('ES256');
  await assert.rejects(verifyMcpToken(await signed({}, attacker.privateKey), config, keys));
  for (const change of [{ aud: 'authenticated' }, { aud: [config.resource, 'authenticated'] }, { iss: 'https://attacker.example' }, { exp: 1 }, { iat: Math.floor(Date.now() / 1000) + 60 }, { role: 'service_role' }, { session_id: null }, { sub: 'not-a-user' }, { client_id: '' }, { exp: undefined }]) {
    await assert.rejects(verifyMcpToken(await signed(change), config, keys));
  }
  await assert.rejects(verifyMcpToken('not.a.token', config, keys));
});
test('configuration fails closed and rejects insecure remote origins', () => {
  assert.equal(siteOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const site of [undefined, 'http://remote.example', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?x=1']) assert.throws(() => siteOrigin(site));
  assert.throws(() => mcpConfig({}));
  assert.throws(() => mcpConfig({ NEXT_PUBLIC_SITE_URL: 'https://app.example', NEXT_PUBLIC_SUPABASE_URL: 'https://db.example', SUPABASE_SECRET_KEY: 'x', MCP_ENABLED: 'false' }));
});
