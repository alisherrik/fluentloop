import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyMcpToken } from '../lib/mcp-token.ts';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = await exportJWK(publicKey); jwk.kid = 'test-key';
const keys = createLocalJWKSet({ keys: [jwk] });
const config = { issuer: 'https://auth.example', resource: 'https://app.example/mcp', jwks: new URL('https://auth.example/jwks'), supabaseUrl: 'https://auth.example', publishableKey: 'unused' };
const userId = '67e55044-10b1-426f-9247-bb680e5fe0c8';
const sessionId = '3970a584-0034-42de-9c3a-0d63e3d39549';
async function sign({ key = privateKey, issuer = config.issuer, audience = config.resource, expires = '5m', session = sessionId } = {}) {
  return new SignJWT({ client_id: '33333333-3333-4333-8333-333333333333', session_id: session, role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).setIssuer(issuer).setAudience(audience).setSubject(userId).setIssuedAt().setExpirationTime(expires).sign(key);
}
test('verifies signed resource token and extracts bound identity', async () => {
  assert.deepEqual(await verifyMcpToken(await sign(), config, keys), { userId, clientId: '33333333-3333-4333-8333-333333333333', sessionId });
});
test('rejects forged signature, wrong issuer, audience, expiration and session', async () => {
  const another = await generateKeyPair('ES256');
  for (const options of [{ key: another.privateKey }, { issuer: 'https://evil.example' }, { audience: 'authenticated' }, { expires: '1 second ago' }, { session: 'not-a-uuid' }]) {
    const token = await sign(options);
    await assert.rejects(() => verifyMcpToken(token, config, keys));
  }
});
