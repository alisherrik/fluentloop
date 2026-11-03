import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const alice = '11111111-1111-4111-8111-111111111111';
export const bob = '22222222-2222-4222-8222-222222222222';
export const clientId = '33333333-3333-4333-8333-333333333333';
export const sessionId = '44444444-4444-4444-8444-444444444444';
export const resource = 'https://app.example/mcp';
export async function nativeDatabase(migration='migrations/006_user_jwt_mcp.sql') {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key);
    -- Minimal real SQL fixture for documented auth.sessions columns; this does not run Supabase Auth.
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, oauth_client_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on all functions in schema auth to authenticated,anon;`);
  for (const file of ['production_dashboard.sql',migration]) await db.exec(await readFile(new URL('../../supabase/'+file, import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [alice,bob]);
  await db.query("insert into public.mcp_clients(client_id,display_name,enabled,resource) values($1,'Test client',true,$2)", [clientId,resource]);
  await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[sessionId,alice,clientId]);
  return Object.assign(db,{ async asUser(user:string, client?:string) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,...(client?{client_id:client}:{})})]);
    await db.exec('set role authenticated');
  }});
}
