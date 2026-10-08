import {session,sb,reply,sbFailure,usesSupabase,type Session} from '@/lib/supabase';
import {sameOrigin} from '@/lib/data';
import {boundedPhoto,validDogPhoto,dogPhotoPath} from '@/lib/dog-photo';
import {photoStorage,PHOTO_BUCKET,removeDogPhoto} from '@/lib/photo-storage';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
type PhotoRow={id:string;client_id:string|null;dog_photo:boolean;status:string};
async function row(auth:Session,id:string){return (await sb<PhotoRow[]>('/rest/v1/grooming_requests?select=id,client_id,dog_photo,status&id=eq.'+id,auth.token))[0];}
export async function POST(req:Request,context:Context){
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return reply({error:'Add the photo from the booking page.'},403);
  if(!usesSupabase())return reply({error:'Photo uploads require a customer account.'},409);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');if(!auth)return reply({error:'Sign in to add the photo.'},401);
  const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return reply({error:'Request not found.'},404,auth);
  const booking=await row(auth,id);if(!booking)return reply({error:'Request not found.'},404,auth);
  if(booking.client_id!==auth.user.id)return reply({error:'Only the customer can add this photo.'},403,auth);
  if(booking.status!=='new')return reply({error:'Photos can be added while the request is waiting for Kevin.'},409,auth);
  if(req.headers.get('content-type')!=='image/jpeg')return reply({error:'Choose a JPEG, PNG or WebP photo in the form.'},415,auth);
  let bytes:Uint8Array;try{bytes=await boundedPhoto(req)}catch{return reply({error:'The prepared photo must be smaller than 1 MB.'},413,auth)}
  if(!validDogPhoto(bytes))return reply({error:'This file is not a supported photo.'},400,auth);
  const path=dogPhotoPath(auth.user.id,id);
  const response=await photoStorage('object/'+PHOTO_BUCKET+'/'+path,auth,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'true'},body:new Blob([bytes as BlobPart],{type:'image/jpeg'})});
  if(!response.ok)return reply({error:'Your request is saved, but the photo could not be uploaded. Please retry.'},503,auth);
  try{await sb('/rest/v1/rpc/grooming_set_photo',auth.token,{method:'POST',body:JSON.stringify({p_id:id})})}catch(e){try{await removeDogPhoto(auth,auth.user.id,id)}catch{}throw e;}
  return reply({ok:true},200,auth);
 }catch(e){return sbFailure(e,auth)}
}
export async function GET(req:Request,context:Context){
 let auth:Session|null=null;
 try{
  if(!usesSupabase())return reply({error:'Photo not found.'},404);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');if(!auth)return reply({error:'Sign in to view this photo.'},401);
  const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return reply({error:'Photo not found.'},404,auth);
  const booking=await row(auth,id);if(!booking?.dog_photo||!booking.client_id)return reply({error:'Photo not found.'},404,auth);
  const response=await photoStorage('object/authenticated/'+PHOTO_BUCKET+'/'+dogPhotoPath(booking.client_id,id),auth);
  if(!response.ok)return reply({error:'Photo unavailable.'},404,auth);
  const result=new Response(response.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline; filename="dog.jpg"'}});
  for(const c of auth.cookies)result.headers.append('Set-Cookie',c);return result;
 }catch(e){return sbFailure(e,auth)}
}
