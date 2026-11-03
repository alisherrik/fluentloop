import { mcpConfig } from '../../../../lib/config.ts';
import { protectedResourceMetadata } from '../../../../lib/mcp-route.ts';
import { unavailable } from '../../../../lib/mcp-unavailable.ts';
export const dynamic = 'force-dynamic';
export function GET() { try { return protectedResourceMetadata(mcpConfig()); } catch { return unavailable(); } }
