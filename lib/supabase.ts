import { runtime,json } from './data';
import { supabaseHttp,SupabaseError } from './supabase-http';
export { SupabaseError };
export function usesSupabase(){return runtime().BOOKING_BACKEND==='supabase';}
function config(){const e=runtime();if(!e.SUPABASE_URL||!e.SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase configuration is incomplete');return {url:e.SUPABASE_URL.replace(/\/$/,''),key:e.SUPABASE_PUBLISHABLE_KEY};}
export function sb<T>(path:string,token?:string,init:RequestInit={}){return supabaseHttp<T>(config(),path,token,init);}
export type AuthUser={id:string;email?:string;is_anonymous?:boolean;email_confirmed_at?:string};
export type AuthTokens={access_token:string;refresh_token:string;user:AuthUser};
export type Session={token:string;user:AuthUser;admin:boolean;demo:boolean;cookies:string[]};
export function readCookie(req:Request,name:string){const value=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);try{return value?decodeURIComponent(value):undefined}catch{return undefined}}
export function cookie(name:string,value:string,maxAge:number){return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
function names(demo:boolean){return demo?['grooming_practice_access','grooming_practice_refresh']:['grooming_access','grooming_refresh'];}
export function sessionCookies(tokens:AuthTokens,demo=false){const n=names(demo),age=demo?86400:30*86400;return [cookie(n[0],tokens.access_token,age),cookie(n[1],tokens.refresh_token,age)];}
export function clearSession(demo=false){return names(demo).map(n=>cookie(n,'',0));}
export async function session(req:Request,demo=false):Promise<Session|null>{
 const n=names(demo);let token=readCookie(req,n[0]);const refresh=readCookie(req,n[1]);let changed:string[]=[];
 let user:AuthUser|undefined;
 if(token){try{user=await sb<AuthUser>('/auth/v1/user',token)}catch(e){if(!(e instanceof SupabaseError)||![400,401,403].includes(e.status))throw e;}}
 if(!user&&refresh){try{const renewed=await sb<AuthTokens>('/auth/v1/token?grant_type=refresh_token',undefined,{method:'POST',body:JSON.stringify({refresh_token:refresh})});token=renewed.access_token;user=await sb<AuthUser>('/auth/v1/user',token);changed=sessionCookies(renewed,demo);}catch(e){if(!(e instanceof SupabaseError)||![400,401,403].includes(e.status))throw e;return null;}}
 if(!token||!user||Boolean(user.is_anonymous)!==demo)return null;
 // Identity and role come from Supabase, never from client metadata or cookies.
 if(!demo&&!user.email_confirmed_at)return null;
 const admin=demo||await sb<boolean>('/rest/v1/rpc/grooming_is_admin',token,{method:'POST',body:'{}'});
 return {token,user,admin,demo,cookies:changed};
}
export function reply(data:unknown,status=200,auth?:Session|null,extraCookies:string[]=[]){const r=json(data,status);for(const c of [...(auth?.cookies||[]),...extraCookies])r.headers.append('Set-Cookie',c);return r;}
export function sbFailure(error:unknown,auth?:Session|null){
 console.error('Grooming storage operation failed',error instanceof SupabaseError?{status:error.status,code:error.code}:error instanceof Error?error.name:'unknown');
 if(error instanceof SupabaseError){
  if(error.code==='23P01')return reply({error:'Another confirmed visit overlaps this visit or travel time. Choose a free time.'},409,auth);
  if(error.code==='P0002')return reply({error:'Request not found or already deleted.'},404,auth);
  if(error.code==='P0409'||error.code==='40001')return reply({error:'This request changed. Refresh before updating.'},409,auth);
  if(error.code==='42501')return reply({error:'This account does not have permission for that action.'},403,auth);
  if(error.code==='P0429')return reply({error:'Too many requests. Please try again later.'},429,auth);
  if(['22023','23514','22P02'].includes(error.code))return reply({error:'Please check the date, time and request details.'},400,auth);
 }
 return reply({error:'We could not connect right now. Please try again.'},503,auth);
}
