import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nativeDatabase, alice, bob, clientId, sessionId, resource } from './support/native-db.ts';
const issuer='https://db.example/auth/v1';
let db:Awaited<ReturnType<typeof nativeDatabase>>;
before(async()=>{db=await nativeDatabase('migrations/006_user_jwt_mcp.sql');await db.query('update public.mcp_clients set issuer=$1',[issuer]);});
after(async()=>{await db?.close();});
async function oauth(changes:Record<string,unknown>={}) {
  await db.exec('reset role');
  const claims={sub:alice,client_id:clientId,session_id:sessionId,aud:resource,iss:issuer,role:'authenticated',is_anonymous:false,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...changes};
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);await db.exec('set role authenticated');
}
const save=(id=randomUUID(),text='I goes')=>db.query('select * from public.mcp_save_correction($1,$2,$3,$4)',[id,text,'I go','Use go with I.']);
test('authenticated wrapper derives identity from verified request claims without a service key',async()=>{
  await oauth();assert.equal((await db.query('select public.mcp_check_session() as ok')).rows[0].ok,true);
  assert.equal((await save()).rows.length,1);
  await db.asUser(alice);assert.equal((await db.query('select * from public.corrections')).rows.length,1);
  await db.asUser(bob);assert.equal((await db.query('select * from public.corrections')).rows.length,0);
});
test('browser, wrong audience/issuer/identity, anonymous and expired claims fail closed',async()=>{
  for(const change of [{client_id:null},{aud:'authenticated'},{aud:[resource,'authenticated']},{iss:'https://evil.example'},{sub:bob},{session_id:randomUUID()},{is_anonymous:true},{exp:1},{iat:Math.floor(Date.now()/1000)+60},{role:'service_role'}]) {
    await oauth(change);await assert.rejects(()=>save(),/denied/);
  }
  const second=randomUUID();await db.exec('reset role');
  await db.query("insert into public.mcp_clients(client_id,display_name,enabled,resource,issuer) values($1,'Other',true,$2,$3)",[second,resource,issuer]);
  await oauth({client_id:second});await assert.rejects(()=>save(),/Session denied/);
});
test('spoofed RPC identity arguments and privileged internals cannot be executed',async()=>{
  await oauth();
  await assert.rejects(()=>db.exec('select * from public.mcp_save_correction(null,null,null,null,null,null,null,null)'),/does not exist|permission denied/);
  await assert.rejects(()=>db.exec('select fluentloop_private.mcp_check_session(null,null,null,null)'),/permission denied/);
  await db.exec('reset role;grant usage on schema fluentloop_private to authenticated');
  await oauth();await assert.rejects(()=>db.exec('select fluentloop_private.mcp_check_session(null,null,null,null)'),/permission denied/);
  await db.exec('reset role;revoke usage on schema fluentloop_private from authenticated');
  await db.exec('reset role;set role anon');await assert.rejects(()=>save(),/permission denied/);
  await db.exec('reset role;set role service_role');await assert.rejects(()=>db.exec('select fluentloop_private.mcp_check_session(null,null,null,null)'),/permission denied/);
});
test('idempotency, changed-payload detection and deletion receipts remain atomic',async()=>{
  await oauth();const id=randomUUID();const first=(await save(id)).rows[0];assert.deepEqual((await save(id)).rows[0],first);
  await assert.rejects(()=>save(id,'changed'),/different content/);
  await db.asUser(alice);await db.query('delete from public.corrections where request_id=$1',[id]);
  await oauth();await assert.rejects(()=>save(id),/already deleted/);
});
test('an otherwise valid token cannot use an expired native session',async()=>{
  const sid=randomUUID();await db.exec('reset role');
  await db.query("insert into auth.sessions(id,user_id,oauth_client_id,not_after) values($1,$2,$3,now()-interval '1 second')",[sid,alice,clientId]);
  await oauth({session_id:sid});await assert.rejects(()=>save(),/Session denied/);
});
test('native revocation denies old token after reapproval, including retries',async()=>{
  await oauth();const id=randomUUID();await save(id);await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessionId]);
  await oauth();await assert.rejects(()=>save(id),/Session denied/);
  const fresh=randomUUID();await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[fresh,alice,clientId]);
  await oauth({session_id:fresh});await save();await oauth();await assert.rejects(()=>save(id),/Session denied/);
});
test('authenticated per-user quota survives deletion and private state remains inaccessible',async()=>{
  const sid=randomUUID();await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[sid,bob,clientId]);
  await oauth({sub:bob,session_id:sid});const first=randomUUID();await save(first);
  for(let i=1;i<120;i++)await save();await save(first);
  await db.asUser(bob);await db.exec('delete from public.corrections');await oauth({sub:bob,session_id:sid});await assert.rejects(()=>save(),/Upload limit/);
  await assert.rejects(()=>db.exec('select * from public.mcp_upload_windows'),/permission denied/);
});
