'use client';
import { useEffect, useRef, useState } from 'react';
import { browserClient } from '../../../lib/supabase/browser';
import { consentIdentityChanged, consentSessionKey } from '../../../lib/consent-session';

type Details = { clientId: string; name: string; scope: string; redirectUri: string; userId: string };
export function Consent({ authorizationId }: { authorizationId: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [message, setMessage] = useState('Checking connection.');
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const loadedIdentity = useRef<string | null>(null);
  const supabase = browserClient();
  useEffect(() => {
    if (!supabase || !authorizationId || authorizationId.length > 256) { setMessage('This authorization request is unavailable.'); return; }
    let disposed = false;
    async function load() {
      if (!supabase) return;
      const current = ++epoch.current;
      setDetails(null); setNeedsLogin(false);
      try {
        const { data: { user }, error: loginError } = await supabase.auth.getUser();
        if (disposed || current !== epoch.current) return;
        if (loginError || !user) { setNeedsLogin(true); setMessage('Sign in before connecting your account.'); return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (disposed || current !== epoch.current) return;
        const identity = consentSessionKey(session);
        if (!identity || session?.user.id !== user.id) { setMessage('Your sign-in changed. Start a new connection from your AI app.'); return; }
        loadedIdentity.current = identity;
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (disposed || current !== epoch.current) return;
        if (error || !data) { setMessage('This authorization request expired or is invalid. Start a new connection from your AI app.'); return; }
        // Supabase alone handles existing consent; there is no app grant to activate.
        if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
        const app = await supabase.from('mcp_clients').select('client_id,display_name,enabled,resource').eq('client_id', data.client.id).maybeSingle();
        if (disposed || current !== epoch.current) return;
        if (data.user.id !== user.id || !app.data?.enabled || app.data.resource !== window.location.origin + '/mcp') { setMessage('This app is not registered for FluentLoop.'); return; }
        setDetails({ clientId: app.data.client_id, name: app.data.display_name, scope: data.scope, redirectUri: data.redirect_uri, userId: user.id });
        setMessage('');
      } catch { if (!disposed && current === epoch.current) setMessage('Could not load authorization. Start a new connection from your AI app.'); }
    }
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!consentIdentityChanged(loadedIdentity.current, event, session)) return;
      ++epoch.current; setDetails(null); setMessage('Your sign-in changed. Start a new connection from your AI app.');
    });
    return () => { disposed = true; ++epoch.current; loadedIdentity.current = null; listener.subscription.unsubscribe(); };
  }, [supabase, authorizationId]);
  async function login() {
    if (!supabase) return;
    const next = '/oauth/consent?authorization_id=' + encodeURIComponent(authorizationId);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback?next=' + encodeURIComponent(next) } });
    if (error) setMessage('Could not start Google sign in.');
  }
  async function decide(allow: boolean) {
    if (!supabase || !details || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const snapshot = epoch.current;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (snapshot !== epoch.current || user?.id !== details.userId) throw new Error('Session changed');
      // One native consent decision; no independent grant write, callback or retry.
      const { data, error } = allow
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (snapshot !== epoch.current) return;
      if (error || !data) throw new Error('Consent outcome unknown');
      window.location.assign(data.redirect_url);
    } catch {
      if (snapshot === epoch.current) {
        setDetails(null);
        setMessage('The decision could not be confirmed. Check AI connections in your notebook before starting a new connection.');
      }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <main><header><a className="brand" href="/">fluent<span>loop</span>.</a></header><section className="notice consent"><p className="eyebrow">YOU CHOOSE WHAT TO SHARE</p><h1>Connect your notebook.</h1>{message && <p role="status">{message}</p>}{needsLogin && <button onClick={() => void login()}>Continue with Google</button>}{details && <><h2>{details.name}</h2><p>This app can add an original sentence, corrected sentence and explanation when you explicitly ask. It cannot read or delete your notebook. Your local hooks remain offline. Revoke access from AI connections at any time.</p><p className="small">Identity information requested: {details.scope || 'none'}. Return address: {details.redirectUri}</p><div className="actions"><button disabled={busy} onClick={() => void decide(true)}>Allow correction uploads</button><button className="quiet" disabled={busy} onClick={() => void decide(false)}>Deny</button></div></>}</section></main>;
}
