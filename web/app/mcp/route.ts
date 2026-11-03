import { createMcpRoute } from '../../lib/mcp-route.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = createMcpRoute();
export const POST = GET;
export const DELETE = GET;
