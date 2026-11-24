// Real SDK HTTP + JWKS + PostgreSQL integration. Supabase Auth is NOT running:
// keys and documented auth.sessions rows are synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpRoute } from '../lib/mcp-route.ts';
import { verifyMcpToken } from '../lib/mcp-token.ts';
import { nativeDatabase, alice, bob, clientId, sessionId } from './support/native-db.ts';

test('SDK HTTP client verifies remote JWKS and saves only to its real SQL notebook; revoked session fails', async () => {
  const db = await nativeDatabase('migrations/006_user_jwt_mcp.sql');
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'local-integration';
  let route: (request:Request)=>Promise<Response>;
  const http = createServer(async (req,res) => {
    try {
      if (req.url === '/jwks') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}));return;}
      const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk));
      const response = await route(new Request(`http://${req.headers.host}${req.url}`, {method:req.method, headers:req.headers as Record<string,string>,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(500);res.end('Local integration adapter failed');}
  });
  const client = new Client({name:'local-sdk-integration',version:'1'});
  try {
    http.listen(0,'127.0.0.1');await once(http,'listening');
    const port=(http.address() as {port:number}).port;
    const origin=`http://127.0.0.1:${port}`;
    const config={resource:origin+'/mcp',issuer:origin+'/auth/v1',jwks:new URL(origin+'/jwks'),supabaseUrl:origin,publishableKey:'unused'};
    await db.query('update public.mcp_clients set resource=$1,issuer=$2',[config.resource,config.issuer]);
    route=createMcpRoute({config:()=>config,verify:verifyMcpToken,backend:(_,bearer)=>({
      authorize:async()=>{try {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(decodeJwt(bearer))]);
        await db.exec('set role authenticated');
        return (await db.query('select public.mcp_check_session() as ok')).rows[0].ok;
      }catch(error){if(error.code==='42501')return false;throw error;}},
      store:()=>({save:async(input)=>{
        const result=await db.query('select * from public.mcp_save_correction($1,$2,$3,$4)',[input.request_id,input.original,input.corrected,input.explanation]);
        return result.rows[0];
      }})
    })});
    const token=await new SignJWT({client_id:clientId,session_id:sessionId,role:'authenticated'})
      .setProtectedHeader({alg:'ES256',kid:jwk.kid}).setSubject(alice).setIssuer(config.issuer).setAudience(config.resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await client.connect(new StreamableHTTPClientTransport(new URL(config.resource),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['save_correction']);
    const input={request_id:randomUUID(),consent:true,original:'I goes',corrected:'I go',explanation:'Use go with I.'};
    const result=await client.callTool({name:'save_correction',arguments:input});assert.notEqual(result.isError,true);
    const again=await client.callTool({name:'save_correction',arguments:input});assert.deepEqual(again.structuredContent,result.structuredContent);
    const extra=await client.callTool({name:'save_correction',arguments:{...input,transcript:'must not upload'}});assert.equal(extra.isError,true);
    await db.asUser(alice);const saved=(await db.query('select original,corrected,explanation from public.corrections')).rows;
    assert.deepEqual(saved,[{original:input.original,corrected:input.corrected,explanation:input.explanation}]);
    await db.asUser(bob);assert.equal((await db.query('select * from public.corrections')).rows.length,0);
    await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessionId]);
    const denied=await fetch(config.resource,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
  } finally {
    await client.close();http.closeAllConnections();await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));await db.close();
  }
});
