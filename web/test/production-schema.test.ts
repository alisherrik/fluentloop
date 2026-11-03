import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/production_dashboard.sql',import.meta.url),'utf8');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
async function setup(db: PGlite) {
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
 alter default privileges in schema public grant all on tables to public,anon,authenticated;
 alter default privileges in schema public grant all on sequences to public,anon,authenticated;`);
}
async function asUser(db:PGlite, user:string, oauth=false) {
 await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,...(oauth?{client_id:'lab'}:{})})]); await db.exec('set role authenticated');
}
test('production migration enforces RLS, least privilege, isolation and locked grants',async()=>{
 const db=new PGlite(); try {
  await setup(db); await db.exec(sql);
  const table=await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class where oid in ('public.corrections'::regclass,'public.mcp_clients'::regclass,'public.mcp_grants'::regclass) order by relname");
  assert.equal(table.rows.length,3); assert.ok(table.rows.every(r=>r.relrowsecurity));
  for(const t of ['corrections','mcp_clients','mcp_grants']) for(const p of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
   const result=await db.query<{anon:boolean;auth:boolean}>("select has_table_privilege('anon',$1,$2) anon,has_table_privilege('authenticated',$1,$2) auth",['public.'+t,p]);
   const expected=t==='corrections'?['SELECT','INSERT','DELETE']:t==='mcp_clients'?['SELECT']:['SELECT','DELETE'];
   assert.equal(result.rows[0].anon,false,`${t} anon ${p}`); assert.equal(result.rows[0].auth,expected.includes(p),`${t} auth ${p}`);
  }
  const seq=await db.query<{anon:boolean;auth:boolean}>("select has_sequence_privilege('anon','public.corrections_id_seq','USAGE') anon,has_sequence_privilege('authenticated','public.corrections_id_seq','USAGE') auth");
  assert.deepEqual(seq.rows[0],{anon:false,auth:true});
  await db.query('insert into auth.users(id) values ($1),($2)',[alice,bob]);
  await db.exec("insert into public.mcp_clients(client_id,display_name,enabled) values('lab','Lab',true),('two','Two',true)");
  await db.query("insert into public.mcp_grants(user_id,client_id) values($1,'lab'),($2,'lab')",[alice,bob]);
  await asUser(db,alice);
  await db.exec("insert into public.corrections(original,corrected,explanation,request_id) values('bad','better','why','33333333-3333-4333-8333-333333333333')");
  await assert.rejects(db.exec("insert into public.corrections(original,corrected,explanation,request_id) values('bad','better','why','33333333-3333-4333-8333-333333333333')"),/unique/);
  await assert.rejects(db.query("insert into public.corrections(user_id,original,corrected,explanation) values($1,'bad','better','why')",[bob]),/row-level security/);
  await assert.rejects(db.exec("insert into public.mcp_grants(client_id) values('two')"),/permission denied|row-level security/);
  await assert.rejects(db.exec("update public.mcp_grants set client_id='two'"),/permission denied|row-level security/);
  await asUser(db,bob); assert.equal((await db.query('select * from public.corrections')).rows.length,0); await db.exec('delete from public.corrections');
  await asUser(db,alice,true); assert.equal((await db.query('select * from public.corrections')).rows.length,0); await assert.rejects(db.exec("insert into public.corrections(original,corrected,explanation) values('bad','better','why')"),/row-level security/);
  await asUser(db,alice); assert.equal((await db.query('select * from public.corrections')).rows.length,1);
  await db.exec("delete from public.mcp_grants where client_id='lab'"); await db.exec('reset role');
  assert.deepEqual((await db.query<{user_id:string}>('select user_id from public.mcp_grants')).rows.map(x=>x.user_id),[bob]);
  await db.exec("grant insert,update on public.mcp_grants to authenticated; create policy deliberately_broad_insert on public.mcp_grants for insert to authenticated with check(true); create policy deliberately_broad_update on public.mcp_grants for update to authenticated using(true) with check(true)");
  await asUser(db,bob); await assert.rejects(db.exec("insert into public.mcp_grants(client_id) values('two')"),/row-level security/);
  assert.equal((await db.query("update public.mcp_grants set client_id='two' returning client_id")).rows.length,0);
 } finally {await db.close();}
});
test('a schema collision leaves existing objects and rows unchanged',async()=>{
 const db=new PGlite(); try {
  await setup(db); await db.exec("create table public.mcp_clients(marker text); insert into public.mcp_clients values('preserve')");
  await assert.rejects(db.exec(sql),/already exists/); await db.exec('rollback');
  assert.equal((await db.query<{name:string|null}>("select to_regclass('public.corrections')::text as name")).rows[0].name,null);
  assert.deepEqual((await db.query('select marker from public.mcp_clients')).rows,[{marker:'preserve'}]);
  assert.equal((await db.query<{name:string|null}>("select to_regclass('public.mcp_grants')::text as name")).rows[0].name,null);
 } finally {await db.close();}
});

test('a mid-transaction error rolls back newly created tables',async()=>{
 const db=new PGlite(); try {
  await setup(db);
  const broken=sql.replace('create table public.mcp_clients (','select 1/0;\ncreate table public.mcp_clients (');
  assert.notEqual(broken,sql); await assert.rejects(db.exec(broken),/division by zero/); await db.exec('rollback');
  for(const name of ['corrections','mcp_clients','mcp_grants','corrections_id_seq']) {
   const result=await db.query<{name:string|null}>('select to_regclass($1)::text as name',['public.'+name]);
   assert.equal(result.rows[0].name,null);
  }
 } finally {await db.close();}
});
