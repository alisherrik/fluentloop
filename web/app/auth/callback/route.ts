import { NextResponse } from 'next/server';
import { serverClient } from '../../../lib/supabase/server';
import { safeNext } from '../../../lib/redirect';
export async function GET(request: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return new Response('Site URL is not configured', { status: 503 });
  let origin: string;
  try {
    const configured = new URL(site);
    if ((configured.protocol !== 'https:' && !(configured.protocol === 'http:' && configured.hostname === 'localhost')) || configured.pathname !== '/' || configured.search || configured.hash || configured.username || configured.password) throw new Error();
    origin = configured.origin;
  } catch { return new Response('Site URL is invalid', { status: 503 }); }
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  if (code) {
    try {
      const supabase = await serverClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNext(params.get('next')), origin));
    } catch { /* Fail closed without exposing provider details. */ }
  }
  return NextResponse.redirect(new URL('/?auth_error=1', origin));
}
