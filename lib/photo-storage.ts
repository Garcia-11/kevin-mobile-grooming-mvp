import {runtime} from './data';
import {SupabaseError} from './supabase-http';
import {dogPhotoPath} from './dog-photo';
import type {Session} from './supabase';
export const PHOTO_BUCKET='grooming-dog-photos';
export async function photoStorage(path:string,auth:Session,init:RequestInit={}){
 const env=runtime();if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw new Error('Photo storage unavailable');
 const headers=new Headers(init.headers);headers.set('apikey',env.SUPABASE_PUBLISHABLE_KEY);headers.set('Authorization','Bearer '+auth.token);
 return fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/'+path,{...init,headers,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)}).catch(e=>{console.error('Photo storage transport failed',e instanceof Error?{name:e.name,reason:e.message.replace(env.SUPABASE_PUBLISHABLE_KEY!,'[redacted]').slice(0,180)}:'unknown');throw e;});
}
export async function removeDogPhoto(auth:Session,clientId:string,id:string){
 const r=await photoStorage('object/'+PHOTO_BUCKET,auth,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[dogPhotoPath(clientId,id)]})});
 if(!r.ok)throw new SupabaseError(r.status,'photo_unavailable');
}
