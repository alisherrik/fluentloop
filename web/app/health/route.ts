export const dynamic = 'force-dynamic';
export function GET() { return Response.json({ status: 'ok', service: 'fluentloop' }, { headers: { 'Cache-Control': 'no-store' } }); }
