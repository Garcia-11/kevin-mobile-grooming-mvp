// HTTP only: supported by the Sites/Cloudflare Worker runtime. No service key.
export type SupabaseConfig = { url:string; key:string };
export class SupabaseError extends Error {
 constructor(public status:number, public code:string){super('Supabase request failed');}
}
export async function supabaseHttp<T>(config:SupabaseConfig,path:string,token?:string,init:RequestInit={}):Promise<T>{
 const headers=new Headers(init.headers);
 headers.set('apikey',config.key);
 if(token)headers.set('Authorization','Bearer '+token);
 if(init.body)headers.set('Content-Type','application/json');
 const response=await fetch(config.url+path,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
 const value=await response.json().catch(()=>null) as {code?:string;error_code?:string}|null;
 if(!response.ok)throw new SupabaseError(response.status,String(value?.code||value?.error_code||'unavailable'));
 return value as T;
}
