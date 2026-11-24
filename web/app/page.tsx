'use client';
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { browserClient } from '../lib/supabase/browser';
import { validateCorrection, sameCorrection } from '../lib/correction';
import { Connections } from './connections';
import { SessionEpoch } from '../lib/session-epoch';

type Row = { id: number; original: string; corrected: string; explanation: string; created_at: string };
const client: SupabaseClient | null = browserClient();

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sessionEpoch = useRef(new SessionEpoch());
  const currentUser = useRef<string | null>(null);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  async function refresh() {
    if (!client) return;
    const snapshot = sessionEpoch.current.snapshot();
    const { data, error } = await client.from('corrections').select('id,original,corrected,explanation,created_at').order('created_at', { ascending: false }).limit(100);
    if (!sessionEpoch.current.current(snapshot)) return;
    if (error) setMessage(error.message); else setRows(data ?? []);
  }
  useEffect(() => {
    if (!client) { setLoading(false); return; }
    const supabase = client;
    const applyUser = (next: User | null) => {
      const nextId = next?.id ?? null;
      sessionEpoch.current.invalidate();
      if (currentUser.current !== nextId) { setRows([]); setMessage(''); pending.current = null; }
      currentUser.current = nextId;
      setSaving(false); setUser(next); setLoading(false);
    };
    const initial = sessionEpoch.current.snapshot();
    supabase.auth.getUser().then(({ data, error }) => {
      if (!sessionEpoch.current.current(initial)) return;
      applyUser(data.user);
      if (error && error.name !== 'AuthSessionMissingError') setMessage('Could not check your session. Please sign in again.');
    }).catch(() => { if (sessionEpoch.current.current(initial)) { setLoading(false); setMessage('Could not connect. Please retry.'); } });
    if (new URLSearchParams(window.location.search).has('auth_error')) setMessage('Sign in did not finish. Please try again.');
    const { data } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));
    return () => { sessionEpoch.current.invalidate(); data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (user) void refresh(); }, [user]);
  async function signIn() {
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } });
    if (error) setMessage(error.message);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !user) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const correction = validateCorrection({ original: values.get('original'), corrected: values.get('corrected'), explanation: values.get('explanation') });
    if (!correction) { setMessage('Complete all three fields (up to 2,000 characters each).'); return; }
    if (saving) return;
    setSaving(true);
    const snapshot = sessionEpoch.current.snapshot();
    const fingerprint = JSON.stringify(correction);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const { error } = await client.from('corrections').insert({ ...correction, request_id: pending.current.requestId });
      if (!sessionEpoch.current.current(snapshot)) return;
      if (error) {
        if (error.code !== '23505') { setMessage('Could not save. Your text is still here; please retry.'); return; }
        const existing = await client.from('corrections').select('original,corrected,explanation').eq('request_id', pending.current.requestId).maybeSingle();
        if (!sessionEpoch.current.current(snapshot)) return;
        if (existing.error || !sameCorrection(correction, existing.data)) { setMessage('Could not verify this save. Your text is still here; please retry.'); return; }
      }
      pending.current = null;
      form.reset(); setMessage('Correction saved.'); await refresh();
    } catch { if (sessionEpoch.current.current(snapshot)) setMessage('Could not save. Your text is still here; please retry.'); }
    finally { if (sessionEpoch.current.current(snapshot)) setSaving(false); }
  }
  async function remove(id: number) {
    if (!client) return;
    const snapshot = sessionEpoch.current.snapshot();
    const { error } = await client.from('corrections').delete().eq('id', id);
    if (!sessionEpoch.current.current(snapshot)) return;
    if (error) setMessage(error.message); else await refresh();
  }
  return <main><header><a className="brand" href="/">fluent<span>loop</span><i>.</i></a>{user && <button className="quiet" onClick={() => void client?.auth.signOut()}>Sign out</button>}</header>
    <section className="intro"><div><p className="eyebrow">YOUR ENGLISH, IN PROGRESS</p><h1>Small corrections.<br/><em>Big progress.</em></h1><p>Keep the phrases you learn while you work, and come back to them whenever you need.</p></div><div className="mark" aria-hidden="true">&#8599;</div></section>
    {!client ? <section className="notice"><h2>Setup needed</h2><p>Add your Supabase URL and publishable key to <code>.env.local</code> to enable sign in and storage. See the web README.</p></section> : loading ? <p>Loading...</p> : !user ? <section className="notice"><h2>Make it yours</h2><p>Sign in to keep your corrections private to your account.</p><button onClick={() => void signIn()}>Continue with Google <span>&#8599;</span></button><p className="small">Your existing FluentLoop hooks stay local. Nothing is uploaded automatically.</p></section> : <>
      <section className="notice"><div className="sectionhead"><div><p className="eyebrow">YOUR NOTEBOOK</p><h2>Add a correction</h2></div><span className="badge">MANUAL &#183; OPT-IN</span></div><p>Only the three fields below are sent when you choose Save. Do not include sensitive content.</p><form onSubmit={save}><label>What you wrote<textarea name="original" maxLength={2000} required /></label><label>Better version<textarea name="corrected" maxLength={2000} required /></label><label>Why it works<textarea name="explanation" maxLength={2000} required /></label><button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save correction'} <span>&#8599;</span></button></form></section>
      <section className="list"><div className="sectionhead"><div><p className="eyebrow">KEEP LEARNING</p><h2>Your corrections</h2></div><span className="badge">LATEST 100</span></div>{rows.length === 0 ? <p>No corrections yet. Add one above to get started.</p> : rows.map(row => <article key={row.id}><div className="entryhead"><span>{new Date(row.created_at).toLocaleDateString()}</span><button className="quiet" onClick={() => void remove(row.id)}>Delete</button></div><p className="old">{row.original}</p><p className="corrected">{row.corrected}</p><p>{row.explanation}</p></article>)}</section>
      {client && <Connections key={user.id} supabase={client} />} </>}{message && <p role="status" className="status">{message}</p>}<footer>FluentLoop <span>&#183;</span> Practice while you build.</footer></main>;
}


