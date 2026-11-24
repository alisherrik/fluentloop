import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const correctionInput = z.object({
  original: z.string().trim().min(1).max(2000),
  corrected: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().min(1).max(2000),
  request_id: z.uuid().describe('Generate once per correction; reuse the same ID on retries.'),
  consent: z.literal(true).describe('True only after the user explicitly asks to upload these three fields to FluentLoop.')
}).strict();
export type CorrectionInput = z.infer<typeof correctionInput>;
export type McpStore = { save: (input: CorrectionInput) => Promise<{ id: number; created_at: string }> };

export function createMcpServer(store: McpStore) {
  const server = new McpServer({ name: 'FluentLoop', version: '0.3.0' }, {
    instructions: 'Upload corrections only when the user explicitly asks to save them to FluentLoop. Never upload source code, credentials, transcripts, or unrelated content. Coaching and local hooks work without this server. This connector can only add corrections; it cannot read the notebook.'
  });
  server.registerTool('save_correction', {
    title: 'Save an English correction',
    description: "Save exactly one correction to the authenticated user's FluentLoop notebook after explicit upload consent. Never call automatically. Reuse request_id for retries.",
    inputSchema: correctionInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (input) => {
    try {
      const row = await store.save(input);
      return { content: [{ type: 'text', text: `Correction saved (${row.id}).` }], structuredContent: { id: row.id, created_at: row.created_at } };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Correction was not saved. Check connection permission or retry with the same request_id.' }] };
    }
  });
  return server;
}
