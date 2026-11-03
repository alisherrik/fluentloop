'use client';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = { client_id: string; display_name: string; enabled: boolean };
export function Connections({ supabase }: { supabase: SupabaseClient }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [grants, setGrants] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const [apps, permissions] = await Promise.all([
      supabase.from('mcp_clients').select('client_id,display_name,enabled'),
      supabase.from('mcp_grants').select('client_id')
    ]);
    if (apps.error || permissions.error) { setError('Connections are not configured.'); return; }
    setClients(apps.data ?? []); setGrants((permissions.data ?? []).map((row) => row.client_id)); setError('');
  }
  useEffect(() => { void refresh(); }, [supabase]);
  async function revoke(id: string) {
    setBusy(true); setError('');
    const result = await supabase.from('mcp_grants').delete().eq('client_id', id);
    if (result.error) setError('Could not update permission.'); else await refresh();
    setBusy(false);
  }
  return <section className="notice"><h2>AI connections</h2><p>The MCP connector is not active yet. When enabled and verified, apps will need your permission to upload corrections.</p>{error && <p role="status">{error}</p>}{!error && clients.length === 0 && <p>No apps are registered yet.</p>}{clients.map(app => <article key={app.client_id}><div className="sectionhead"><strong>{app.display_name}{!app.enabled && " (unavailable)"}</strong>{grants.includes(app.client_id) ? <button disabled={busy} onClick={() => void revoke(app.client_id)}>Revoke permission</button> : <span>Not connected</span>}</div></article>)}</section>;
}

