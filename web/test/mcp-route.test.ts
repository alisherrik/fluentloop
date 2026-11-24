import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpRoute, protectedResourceMetadata } from '../lib/mcp-route.ts';
const config = {resource:'https://app.example/mcp', issuer:'https://db.example/auth/v1', jwks:new URL('https://db.example/jwks'),supabaseUrl:'https://db.example',publishableKey:'synthetic'};
const identity = {userId:'11111111-1111-4111-8111-111111111111',clientId:'33333333-3333-4333-8333-333333333333',sessionId:'44444444-4444-4444-8444-444444444444'};
const headers = {Authorization:'Bearer signed',Accept:'application/json, text/event-stream','Content-Type':'application/json'};
const base = {config:()=>config, backend:()=>({authorize:async()=>true,store:()=>({save:async()=>({id:1,created_at:'now'})})}),verify:async()=>identity};
const request = (options:RequestInit={}) => new Request(config.resource,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),...options});
test('configured route exposes real SDK and canonical OAuth metadata', async()=>{
  const response = await createMcpRoute(base)(request());
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json()).result.tools.map(t=>t.name),['save_correction']);
  assert.deepEqual(await protectedResourceMetadata(config).json(),{resource:config.resource,authorization_servers:[config.issuer],bearer_methods_supported:['header'],resource_name:'FluentLoop correction uploads'});
});
test('missing/invalid bearer, revoked session, foreign origin, unsupported methods fail closed', async()=>{
  const route=createMcpRoute(base);
  const missing=await route(request({headers:{}})); assert.equal(missing.status,401);
  assert.match(missing.headers.get('www-authenticate')!, /resource_metadata="https:\/\/app.example\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.equal((await createMcpRoute({...base,verify:async()=>{throw Error('bad')}})(request())).status,401);
  assert.equal((await createMcpRoute({...base,backend:()=>({...base.backend(),authorize:async()=>false})})(request())).status,401);
  assert.equal((await route(request({headers:{...headers,Origin:'https://evil.example'}}))).status,403);
  assert.equal((await route(new Request(config.resource,{headers}))).status,405);
});
test('bounded body, local admission and unavailable backend fail safely; missing bearer needs no RPC', async()=>{
  assert.equal((await createMcpRoute(base)(request({body:'x'.repeat(16385)}))).status,413);
  let calls=0;
  const limited=createMcpRoute({...base,backend:()=>{calls++;throw Error('must not call');}});
  for(let i=0;i<240;i++)assert.equal((await limited(request({headers:{}}))).status,401);
  assert.equal((await limited(request({headers:{}}))).status,429);
  assert.equal(calls,0);
  assert.equal((await createMcpRoute({...base,backend:()=>{throw Error('SECRET')}})(request())).status,503);
});
