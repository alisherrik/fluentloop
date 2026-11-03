import { createClient } from '@supabase/supabase-js';
import type { McpConfig } from './config.ts';
import type { McpStore } from './mcp-server.ts';

export function mcpBackend(config: McpConfig, token: string) {
  const db = createClient(config.supabaseUrl, config.publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) }) }
  });
  return {
    async authorize(): Promise<boolean> {
      // SQL derives user/client/session/resource from PostgREST-verified JWT claims.
      const { data, error } = await db.rpc('mcp_check_session');
      if (error?.code === '42501') return false;
      if (error) throw new Error('Authorization unavailable');
      return data === true;
    },
    store(): McpStore {
      return { async save(input) {
        const { data, error } = await db.rpc('mcp_save_correction', {
          p_request: input.request_id,
          p_original: input.original, p_corrected: input.corrected, p_explanation: input.explanation
        });
        if (error || !data?.[0]) throw new Error('Correction denied');
        return data[0];
      }};
    }
  };
}
