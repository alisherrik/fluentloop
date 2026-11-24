import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { McpConfig } from './config.ts';

const identity = z.object({ sub: z.uuid(), client_id: z.uuid(), session_id: z.uuid(), exp: z.number().finite(), iat: z.number().finite(), role: z.literal('authenticated'), is_anonymous: z.literal(false).optional() });
export type McpIdentity = { userId: string; clientId: string; sessionId: string };
const keySets = new Map<string, JWTVerifyGetKey>();

export async function verifyMcpToken(token: string, config: McpConfig, testKey?: JWTVerifyGetKey): Promise<McpIdentity> {
  let keys = testKey ?? keySets.get(config.jwks.href);
  if (!keys) { keys = createRemoteJWKSet(config.jwks, { timeoutDuration: 5000, cooldownDuration: 30000 }); keySets.set(config.jwks.href, keys); }
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.resource, algorithms: ['ES256', 'RS256'], requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'client_id', 'session_id'], clockTolerance: 0 });
  if (payload.aud !== config.resource) throw new Error('Incorrect resource audience');
  const claims = identity.parse(payload);
  if (claims.iat > Date.now() / 1000 + 5) throw new Error('Future token');
  return { userId: claims.sub, clientId: claims.client_id, sessionId: claims.session_id };
}
