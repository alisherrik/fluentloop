'use client';
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
type Client = { client_id: string; display_name: string; enabled: boolean };
export function Connections({ supabase }: { supabase: SupabaseClient }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [grants, setGrants] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  async function refresh() {
    const current = ++epoch.current;
    const [apps, permissions] = await Promise.all([
      supabase.from('mcp_clients').select('client_id,display_name,enabled'),
      supabase.auth.oauth.listGrants()
    ]);
    if (current !== epoch.current) return;
    if (apps.error || permissions.error) { setError('AI connections are not available.'); return; }
    setClients(apps.data ?? []); setGrants((permissions.data ?? []).map(row => row.client.id)); setError('');
  }
  useEffect(() => { void refresh().catch(() => setError('Could not check AI connections.')); return () => { ++epoch.current; }; }, [supabase]);
  async function revoke(id: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const current = epoch.current;
    try {
      const result = await supabase.auth.oauth.revokeGrant({ clientId: id });
      if (current !== epoch.current) return;
      if (result.error) { setError('Revocation could not be confirmed. Check connections again; do not assume access has stopped.'); return; }
      setGrants(previous => previous.filter(grant => grant !== id));
      await refresh();
    } catch { if (current === epoch.current) setError('Revocation could not be confirmed. Check connections again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="notice"><h2>AI connections</h2><p>Connected apps can only add corrections when you ask. Local hooks stay offline.</p>{error && <p role="status">{error} <button className="quiet" disabled={busy} onClick={() => void refresh().catch(() => setError('Could not check AI connections.'))}>Check again</button></p>}{!error && clients.length === 0 && <p>No apps are registered yet.</p>}{clients.map(app => <article key={app.client_id}><div className="sectionhead"><strong>{app.display_name}{!app.enabled && ' (unavailable)'}</strong>{grants.includes(app.client_id) ? <button disabled={busy} onClick={() => void revoke(app.client_id)}>Revoke permission</button> : <span>Not connected</span>}</div></article>)}</section>;
}
