import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  const store = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll() { return store.getAll(); },
    setAll(values) { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
  }});
}
