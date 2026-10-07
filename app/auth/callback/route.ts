import { usesSupabase,sb,readCookie,cookie,sessionCookies,type AuthTokens } from '@/lib/supabase';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const url=new URL(req.url),code=url.searchParams.get('code'),verifier=readCookie(req,'grooming_verifier');
 const failed=()=>new Response(null,{status:303,headers:{Location:'/login?callbackError=1','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':cookie('grooming_verifier','',0)}});
 // Email links land without consuming the one-time token. Only an explicit
 // same-origin POST on the confirmation page exchanges it for a session.
 const hash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
 if(hash){
  if(!usesSupabase()||code||!['email','recovery'].includes(type||'')||!/^[A-Za-z0-9_-]{32,512}$/.test(hash))return failed();
  return new Response(null,{status:303,headers:{Location:'/confirm-email?type='+type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':cookie('grooming_email_verification',JSON.stringify({hash,type}),600)}});
 }
 if(!usesSupabase()||!code||!verifier||code.length>2000)return failed();
 try{
  const tokens=await sb<AuthTokens>('/auth/v1/token?grant_type=pkce',undefined,{method:'POST',body:JSON.stringify({auth_code:code,code_verifier:verifier})});
  const user=await sb<AuthTokens['user']>('/auth/v1/user',tokens.access_token);
  if(user.is_anonymous||!user.email_confirmed_at)return failed();
  const response=new Response(null,{status:303,headers:{Location:url.searchParams.get('recovery')==='1'?'/account/password':'/account','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  for(const value of [...sessionCookies(tokens),cookie('grooming_verifier','',0)])response.headers.append('Set-Cookie',value);
  return response;
 }catch{return failed()}
}
