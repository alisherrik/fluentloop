import test from 'node:test';
import assert from 'node:assert/strict';
import { consentSessionKey, consentIdentityChanged } from '../lib/consent-session.ts';
import { SessionEpoch } from '../lib/session-epoch.ts';
const session=(user='alice',id='session-a',iat=1)=>({user:{id:user},access_token:`e30.${Buffer.from(JSON.stringify({session_id:id,iat})).toString('base64url')}.signature`});
test('same-session SIGNED_IN reannouncements preserve consent and pending approval snapshot',()=>{
  const key=consentSessionKey(session());const epoch=new SessionEpoch();const pending=epoch.snapshot();
  for(const next of [session(),session('alice','session-a',2)]) {
    const changed=consentIdentityChanged(key,'SIGNED_IN',next);
    assert.equal(changed,false);if(changed)epoch.invalidate();
  }
  assert.equal(epoch.current(pending),true);
});
test('actual user/session changes and signout invalidate pending consent',()=>{
  const key=consentSessionKey(session());
  for(const next of [session('bob'),session('alice','session-b'),null]) assert.equal(consentIdentityChanged(key,'SIGNED_IN',next),true);
  assert.equal(consentIdentityChanged(key,'SIGNED_OUT',null),true);
  assert.equal(consentIdentityChanged(null,'SIGNED_IN',session()),false);
  assert.equal(consentSessionKey({user:{id:'alice'},access_token:'invalid'}),null);
});
