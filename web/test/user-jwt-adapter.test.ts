// Unit test of Supabase SDK header/argument wiring; this is not hosted PostgREST.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpBackend } from '../lib/mcp-store.ts';
import { mcpConfig } from '../lib/config.ts';
test('publishable adapter forwards only the user JWT and four correction RPC arguments',async()=>{
  const config=mcpConfig({MCP_ENABLED:'true',NEXT_PUBLIC_SITE_URL:'https://app.example',NEXT_PUBLIC_SUPABASE_URL:'https://db.example',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_unit_test'});
  assert.equal('secretKey' in config,false);
  const requests: {url:string;headers:Headers;body:unknown}[]=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    requests.push({url:String(url),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body??'{}'))});
    return Response.json(String(url).endsWith('/mcp_check_session')?true:[{id:1,created_at:'now'}]);
  };
  try {
    const backend=mcpBackend(config,'synthetic-user-resource-jwt');assert.equal(await backend.authorize(),true);
    await backend.store().save({request_id:'33333333-3333-4333-8333-333333333333',original:'I goes',corrected:'I go',explanation:'Use go',consent:true});
    assert.equal(requests.length,2);
    for(const req of requests){assert.equal(req.headers.get('authorization'),'Bearer synthetic-user-resource-jwt');assert.equal(req.headers.get('apikey'),config.publishableKey);}
    assert.deepEqual(requests[0].body,{});
    assert.deepEqual(requests[1].body,{p_request:'33333333-3333-4333-8333-333333333333',p_original:'I goes',p_corrected:'I go',p_explanation:'Use go'});
  } finally {globalThis.fetch=original;}
});
