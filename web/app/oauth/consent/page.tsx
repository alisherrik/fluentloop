import { mcpConfig } from '../../../lib/config.ts';
import { Consent } from './consent';
export const dynamic = 'force-dynamic';
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string | string[] }> }) {
  try { mcpConfig(); } catch {
    return <main><section className="notice"><h1>AI connections are not available yet.</h1><p>Return to your notebook.</p><a href="/">Back to FluentLoop</a></section></main>;
  }
  const { authorization_id } = await searchParams;
  return <Consent authorizationId={typeof authorization_id === 'string' ? authorization_id : ''} />;
}
