import assert from 'node:assert/strict';
import { createDeleteAccountHandler, GET as deleteReadiness } from './server/delete-account.mjs';
import { DELETE_CONFIRMATION, json, privacyConfigured, readSmallJson, verifiedSessionId } from './server/privacy-utils.mjs';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const token=claims=>`header.${Buffer.from(JSON.stringify({sub:owner,session_id:session,...claims})).toString('base64url')}.signature`;
const user={id:owner};
const authenticate=async()=>({user,token:token()});
const request=(body,origin='https://lernkarte-maker.vercel.app')=>new Request('https://lernkarte-maker.vercel.app/api/delete-account',{method:'POST',headers:{origin,'content-type':'application/json',authorization:`Bearer ${token()}`},body:JSON.stringify(body)});
const confirmed={confirmation:DELETE_CONFIRMATION};
function deletionService({recent=true,rpcError=null,signOutError=null,deleteError=null,deletedId=owner}={}){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push([name,args]);return {data:recent,error:rpcError};},auth:{admin:{
    signOut:async(jwt,scope)=>{calls.push(['signOut',jwt,scope]);return {error:signOutError};},
    deleteUser:async(id,soft)=>{calls.push(['deleteUser',id,soft]);return {data:{user:{id:deletedId}},error:deleteError};}
  }}};
}
assert.equal(privacyConfigured({}),false);
assert.equal(privacyConfigured({SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'public'}),false);
assert.equal(privacyConfigured({SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'server'}),true);
assert.equal(verifiedSessionId(token(),user),session);
assert.equal(verifiedSessionId(token({sub:other}),user),null);
assert.equal(verifiedSessionId('invalid',user),null);
assert.equal((await deleteReadiness(new Request('https://example.invalid/api/delete-account'))).status,401);

for(const body of [{},{confirmation:'ja'},{...confirmed,userId:other}]){
  let touched=false;
  const handler=createDeleteAccountHandler({authenticate,serviceClient:()=>{touched=true;return deletionService();}});
  assert.equal((await handler(request(body))).status,400);assert.equal(touched,false);
}
{
  const service=deletionService();const handler=createDeleteAccountHandler({authenticate,serviceClient:()=>service});
  const response=await handler(request(confirmed));assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});
  assert.deepEqual(service.calls.map(call=>call[0]),['privacy_recent_session','signOut','deleteUser']);
  assert.equal(service.calls[1][2],'global');assert.deepEqual(service.calls[2],['deleteUser',owner,false]);
  assert.deepEqual(service.calls[0][1],{p_user:owner,p_session:session});
}
for(const [settings,status,code] of [[{recent:false},401,'REAUTH_REQUIRED'],[{rpcError:{code:'PGRST202'}},503,'PRIVACY_UNAVAILABLE'],[{signOutError:{}},503,null],[{deleteError:{}},503,'DELETE_FAILED'],[{deletedId:other},503,'DELETE_FAILED']]){
  const service=deletionService(settings);const response=await createDeleteAccountHandler({authenticate,serviceClient:()=>service})(request(confirmed));
  assert.equal(response.status,status);const body=await response.json();assert.equal(body.deleted,undefined);if(code)assert.equal(body.code,code);
  if(settings.recent===false||settings.rpcError||settings.signOutError)assert.equal(service.calls.some(call=>call[0]==='deleteUser'),false);
}
for (const [lookup, expectedStatus] of [
  [{ error: { status: 404, code: 'user_not_found' } }, 200],
  [{ error: { status: 404, code: 'not_found' } }, 503],
  [{ error: { status: 503 } }, 503],
  [{ data: { user }, error: null }, 503]
]) {
  const service = deletionService({ deletedId: null });
  service.auth.admin.getUserById = async id => {
    assert.equal(id, owner);
    return lookup;
  };
  const response = await createDeleteAccountHandler({ authenticate, serviceClient: () => service })(request(confirmed));
  assert.equal(response.status, expectedStatus);
  assert.equal((await response.json()).deleted === true, expectedStatus === 200);
}
{
  const service=deletionService({recent:false});
  const response=await createDeleteAccountHandler({authenticate:async()=>({user,token:token({iat:Math.floor(Date.now()/1000)})}),serviceClient:()=>service})(request(confirmed));
  assert.equal(response.status,401,'a refreshed token timestamp cannot bypass an old original session');
}
{
  let touched=false;const handler=createDeleteAccountHandler({authenticate:async()=>({error:json({error:'Nein'},401)}),serviceClient:()=>{touched=true;}});
  assert.equal((await handler(request(confirmed))).status,401);assert.equal(touched,false);
  assert.equal((await handler(request(confirmed,'https://untrusted.invalid'))).status,403);
}
assert.equal((await createDeleteAccountHandler({authenticate,serviceClient:()=>{throw new Error('secret');}})(request(confirmed))).status,503);

await assert.rejects(()=>readSmallJson(request({confirmation:'x'.repeat(1025)}),1024),error=>error.status===413);
console.log('Account deletion backend checks passed: authentication, recent sessions, confirmation, failure handling and same-origin requests.');
