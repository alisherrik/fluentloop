import { mcpConfig, type McpConfig } from './config.ts';
import { verifyMcpToken, type McpIdentity } from './mcp-token.ts';
import { mcpBackend } from './mcp-store.ts';
import { handleMcp } from './mcp-handler.ts';
import { createAdmission, withAdmission } from './mcp-admission.ts';
import { unavailable } from './mcp-unavailable.ts';
import type { McpStore } from './mcp-server.ts';

type Backend = { authorize: () => Promise<boolean>; store: () => McpStore };
type Dependencies = { config: () => McpConfig; backend: (c: McpConfig, token: string) => Backend; verify: (token: string, c: McpConfig) => Promise<McpIdentity> };
const noStore = { 'Cache-Control': 'no-store' };
export function protectedResourceMetadata(config: McpConfig) {
  return Response.json({ resource: config.resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header'], resource_name: 'FluentLoop correction uploads' }, { headers: noStore });
}
async function boundedBody(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > 16384) throw new RangeError('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = []; let size = 0;
  let timeout: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error('timeout')); }, 5000); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), expired]);
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { void reader.cancel().catch(() => {}); throw new RangeError('body'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timeout!); reader.releaseLock(); }
}
export function createMcpRoute(deps: Dependencies = { config: mcpConfig, backend: mcpBackend, verify: verifyMcpToken }) {
  // Bound memory/concurrency for the whole request, including slow body readers.
  const gate = createAdmission({ maxStarts: 240, windowMs: 60_000, maxInFlight: 8 });
  return async (request: Request): Promise<Response> => {
    let config: McpConfig;
    try { config = deps.config(); } catch { return unavailable(); }
    const unauthorized = () => Response.json({ error: 'invalid_token' }, { status: 401, headers: { ...noStore, 'WWW-Authenticate': `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', config.resource).href}"` } });
    if (request.headers.has('origin') && request.headers.get('origin') !== new URL(config.resource).origin) return new Response('Forbidden origin', { status: 403, headers: noStore });
    try {
      const result = await withAdmission(gate, async () => {
        const bearer = request.headers.get('authorization');
        if (!bearer || bearer.length > 16384 || !/^Bearer [^\s]+$/i.test(bearer)) return unauthorized();

        try { await deps.verify(bearer.slice(7), config); } catch { return unauthorized(); }
        const backend = deps.backend(config, bearer.slice(7));
        if (!await backend.authorize()) return unauthorized();
        if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...noStore, Allow: 'POST' } });
        let bytes: Uint8Array;
        try { bytes = await boundedBody(request); } catch (error) { return new Response('Invalid request body', { status: error instanceof RangeError ? 413 : 400, headers: noStore }); }
        const forwarded = new Request(request.url, { method: 'POST', headers: request.headers, body: bytes as BodyInit });
        const response = await handleMcp(forwarded, backend.store());
        response.headers.set('Cache-Control', 'no-store');
        return response;
      });
      return result.admitted ? result.value : new Response('Too many requests', { status: 429, headers: { ...noStore, 'Retry-After': '60' } });
    } catch { return unavailable(); }
  };
}
