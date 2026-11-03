import { decodeJwt } from 'jose';
type BrowserSession = { user: { id: string }; access_token: string } | null;
// Decoding is ONLY a UI freshness guard. It never authenticates or authorizes;
// getUser and the native OAuth APIs verify the browser session independently.
export function consentSessionKey(session: BrowserSession): string | null {
  if (!session) return null;
  try {
    const id=decodeJwt(session.access_token).session_id;
    return typeof id==='string' ? JSON.stringify([session.user.id,id]) : null;
  } catch { return null; }
}
export function consentIdentityChanged(expected: string | null, event: string, session: BrowserSession): boolean {
  if(event==='SIGNED_OUT') return true;
  // Initial recovery is resolved by getUser/getSession before binding the form.
  return event==='SIGNED_IN' && expected!==null && consentSessionKey(session)!==expected;
}
