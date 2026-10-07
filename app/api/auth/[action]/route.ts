import { z } from 'zod';
import { json,sameOrigin } from '@/lib/data';
import { usesSupabase,sb,session,reply,cookie,readCookie,sessionCookies,clearSession,SupabaseError,type AuthTokens,type Session } from '@/lib/supabase';
const credentials=z.object({email:z.string().trim().email().max(150),password:z.string().min(8).max(128),admin:z.boolean().optional()}).strict();
async function pkce(){const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));const challenge=btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {verifier,challenge};}
export async function GET(req:Request,{params}:{params:Promise<{action:string}>}){
 const {action}=await params;
 if(action!=='session')return json({error:'Not found.'},404);
 if(!usesSupabase())return json({configured:false,authenticated:false});
 try{const auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  return reply(auth?{configured:true,authenticated:true,email:auth.user.email,admin:auth.admin,demo:auth.demo}:{configured:true,authenticated:false},200,auth);
 }catch{return json({error:'We could not check your sign-in. Please try again.'},503)}
}
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
 if(!sameOrigin(req))return json({error:'Please use the sign-in page.'},403);
 if(!usesSupabase())return json({error:'Customer sign-in is not available yet.'},503);
 const {action}=await params;let auth:Session|null=null;
 try{
  if(action==='verify'){
   const clear=[cookie('grooming_email_verification','',0),cookie('grooming_verifier','',0)];
   let value;try{value=JSON.parse(readCookie(req,'grooming_email_verification')||'null')}catch{value=null}
   const proof=z.object({hash:z.string().regex(/^[A-Za-z0-9_-]{32,512}$/),type:z.enum(['email','recovery'])}).strict().safeParse(value);
   if(!proof.success)return reply({error:'Open your latest confirmation or recovery email to continue.'},400,null,clear);
   try{
    const tokens=await sb<AuthTokens>('/auth/v1/verify',undefined,{method:'POST',body:JSON.stringify({token_hash:proof.data.hash,type:proof.data.type})});
    const user=await sb<AuthTokens['user']>('/auth/v1/user',tokens.access_token);
    if(user.is_anonymous||!user.email_confirmed_at)throw new Error('Unverified account');
    return reply({ok:true,next:proof.data.type==='recovery'?'/account/password':'/account'},200,null,[...sessionCookies(tokens),...clear]);
   }catch(e){
    console.error('Email verification failed',e instanceof SupabaseError?{status:e.status,code:e.code}:e instanceof Error?e.name:'unknown');
    if(e instanceof SupabaseError&&e.status>=400&&e.status<500)return reply({error:'This link has expired or was already used. If you confirmed your email, sign in. For password recovery, request a new link.'},401,null,clear);
    throw e;
   }
  }
  if(action==='logout'){
   try{auth=await session(req)}catch{auth=null}
   if(auth){try{await sb('/auth/v1/logout?scope=local',auth.token,{method:'POST'});}catch{/* Clearing this browser's cookies still signs it out during an Auth outage. */}}
   return reply({ok:true},200,null,clearSession());
  }
  const raw=await req.text();if(raw.length>4000)return json({error:'Request is too large.'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Please check your sign-in details.'},400)}
  if(action==='password'){
   const b=z.object({password:z.string().min(8).max(128)}).strict().safeParse(body);
   if(!b.success)return json({error:'Use a password with 8 to 128 characters.'},400);
   auth=await session(req);if(!auth)return json({error:'Please open your recovery link or sign in again.'},401);
   await sb('/auth/v1/user',auth.token,{method:'PUT',body:JSON.stringify({password:b.data.password})});
   return reply({ok:true},200,auth);
  }
  if(action==='recover'){
   const b=z.object({email:z.string().trim().email().max(150)}).strict().safeParse(body);
   if(!b.success)return json({error:'Enter a valid email address.'},400);
   const proof=await pkce(),redirect=new URL('/auth/callback?recovery=1',req.url).href;
   await sb('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),undefined,{method:'POST',body:JSON.stringify({email:b.data.email,code_challenge:proof.challenge,code_challenge_method:'s256'})});
   return reply({message:'If there is an account with that email, a recovery link will be sent. Open it and continue to choose a new password.'},200,null,[cookie('grooming_verifier',proof.verifier,86400)]);
  }
  if(!['login','signup'].includes(action))return json({error:'Not found.'},404);
  const b=credentials.safeParse(body);if(!b.success)return json({error:'Enter a valid email and a password with 8 to 128 characters.'},400);
  if(action==='signup'){
   const proof=await pkce(),redirect=new URL('/auth/callback',req.url).href;
   const tokens=await sb<Partial<AuthTokens>>('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),undefined,{method:'POST',body:JSON.stringify({email:b.data.email,password:b.data.password,code_challenge:proof.challenge,code_challenge_method:'s256'})});
   if(tokens.access_token&&tokens.refresh_token&&tokens.user)return reply({ok:true,next:'/account'},200,null,sessionCookies(tokens as AuthTokens));
   return reply({message:'Check your email for a confirmation link. Open it and select Confirm email and continue to finish your registration.'},200,null,[cookie('grooming_verifier',proof.verifier,86400)]);
  }
  const tokens=await sb<AuthTokens>('/auth/v1/token?grant_type=password',undefined,{method:'POST',body:JSON.stringify({email:b.data.email,password:b.data.password})});
  const user=await sb<AuthTokens['user']>('/auth/v1/user',tokens.access_token);
  if(user.is_anonymous||!user.email_confirmed_at)return json({error:'Confirm your email before signing in.'},401);
  if(b.data.admin){const allowed=await sb<boolean>('/rest/v1/rpc/grooming_is_admin',tokens.access_token,{method:'POST',body:'{}'});if(!allowed){await sb('/auth/v1/logout?scope=local',tokens.access_token,{method:'POST'});return json({error:'This account does not have admin access. Use customer sign-in to view your own visits.'},403);}}
  return reply({ok:true,next:b.data.admin?'/dashboard':'/account'},200,null,sessionCookies(tokens));
 }catch(e){
  if(e instanceof SupabaseError){
   if(e.status===429||e.code==='over_email_send_rate_limit')return reply({error:'Too many attempts. Please wait before trying again.'},429,auth);
   if(e.code==='email_not_confirmed')return reply({error:'Confirm your email before signing in.'},401,auth);
   if(e.code==='weak_password')return reply({error:'Choose a stronger password with at least 8 characters.'},400,auth);
   if(e.status>=400&&e.status<500)return reply({error:action==='login'?'Could not sign in. Check your email and password.':'Could not complete this step. Please try again later.'},400,auth);
  }
  return reply({error:'We could not connect right now. Please try again.'},503,auth);
 }
}
