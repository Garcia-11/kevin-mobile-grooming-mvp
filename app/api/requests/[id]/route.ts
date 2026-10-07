import * as legacy from '@/lib/legacy/request';
import { usesSupabase,session,sb,reply,sbFailure,type Session } from '@/lib/supabase';
import { json,sameOrigin } from '@/lib/data';
import { updateSchema,today } from '@/lib/validation';
import { visitInterval } from '@/lib/scheduling';
import { z } from 'zod';
type Context={params:Promise<{id:string}>};
export async function DELETE(req:Request,context:Context){
 if(!usesSupabase())return legacy.DELETE(req,context);
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return json({error:'Please delete from the workspace.'},403);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  if(!auth)return reply({error:'Please sign in to the admin area.'},401);
  if(!auth.admin)return reply({error:'Admin access is required.'},403,auth);
  let body;try{body=await req.json()}catch{return reply({error:'Confirm deletion before removing this request.'},400,auth)}
  if(!body||typeof body!=='object'||!('confirm' in body)||body.confirm!==true)return reply({error:'Confirm deletion before removing this request.'},400,auth);
  const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return reply({error:'Request not found.'},404,auth);
  return reply(await sb('/rest/v1/rpc/grooming_delete_request',auth.token,{method:'POST',body:JSON.stringify({p_id:id,p_confirm:true})}),200,auth);
 }catch(e){return sbFailure(e,auth)}
}
export async function PATCH(req:Request,context:Context){
 if(!usesSupabase())return legacy.PATCH(req,context);
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return json({error:'Please update from the workspace.'},403);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  if(!auth)return reply({error:'Please sign in to the admin area.'},401);
  if(!auth.admin)return reply({error:'Admin access is required.'},403,auth);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid update.'},400,auth)}
  const parsed=updateSchema.safeParse(body);if(!parsed.success)return reply({error:parsed.error.issues[0].message},400,auth);
  const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return reply({error:'Request not found.'},404,auth);
  const b=parsed.data;
  if(b.status==='confirmed'){
   if(!b.scheduledAt||b.scheduledAt.slice(0,10)<today()||b.durationMinutes===undefined||b.travelMinutes===undefined)return reply({error:'Choose an agreed date, time, visit duration, and travel time.'},400,auth);
   try{visitInterval(b.scheduledAt,b.durationMinutes,b.travelMinutes)}catch{return reply({error:'Choose a valid reserved time.'},400,auth)}
  }
  if(b.status!=='confirmed'&&(b.scheduledAt||b.durationMinutes!==undefined||b.travelMinutes!==undefined))return reply({error:'Set the reserved time when confirming the request.'},400,auth);
  return reply(await sb('/rest/v1/rpc/grooming_manage_request',auth.token,{method:'POST',body:JSON.stringify({p_id:id,p_status:b.status??null,p_start:b.scheduledAt??null,p_duration:b.durationMinutes??null,p_travel:b.travelMinutes??null,p_seen:b.seen??false})}),200,auth);
 }catch(e){return sbFailure(e,auth)}
}
