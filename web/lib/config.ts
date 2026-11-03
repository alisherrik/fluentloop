export type McpConfig = { resource: string; issuer: string; jwks: URL; supabaseUrl: string; publishableKey: string };

export function siteOrigin(value: string | undefined): string {
  if (!value) throw new Error('Site URL is not configured');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Invalid site URL');
  return url.origin;
}

export function mcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const origin = siteOrigin(env.NEXT_PUBLIC_SITE_URL);
  const supabaseUrl = siteOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.MCP_ENABLED !== 'true') throw new Error('MCP is not configured');
  return { resource: origin + '/mcp', issuer: supabaseUrl + '/auth/v1', jwks: new URL(supabaseUrl + '/auth/v1/.well-known/jwks.json'), supabaseUrl, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}
