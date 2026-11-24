// No request or token is read until resource-bound OAuth is implemented and verified.
export function unavailable(): Response {
  return Response.json({ error: 'mcp_not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
