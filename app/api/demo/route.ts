import * as legacy from '@/lib/legacy/demo';
import { usesSupabase,session,sb,reply,sbFailure,sessionCookies,type AuthTokens,type Session } from '@/lib/supabase';
import { json,sameOrigin } from '@/lib/data';
export async function POST(req:Request){
 if(!usesSupabase())return legacy.POST(req);
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return json({error:'Open the demo from this site.'},403);
  auth=await session(req,true);
  if(auth){await sb('/rest/v1/rpc/grooming_seed_demo',auth.token,{method:'POST',body:'{}'});return reply({ok:true},200,auth);}
  const tokens=await sb<AuthTokens>('/auth/v1/signup',undefined,{method:'POST',body:'{}'});
  if(!tokens.access_token||!tokens.user.is_anonymous)return reply({error:'Practice access is unavailable right now.'},503);
  await sb('/rest/v1/rpc/grooming_seed_demo',tokens.access_token,{method:'POST',body:'{}'});
  return reply({ok:true},200,null,sessionCookies(tokens,true));
 }catch(e){return sbFailure(e,auth)}
}
