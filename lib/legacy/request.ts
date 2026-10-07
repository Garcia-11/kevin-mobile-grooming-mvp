import { access } from '@/lib/auth';
import { db,json,sameOrigin,unavailable } from '@/lib/data';
import { updateSchema,today } from '@/lib/validation';
import { visitInterval } from '@/lib/scheduling';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  if(!sameOrigin(req))return json({error:'Please delete from the workspace.'},403);
  const tenant=await access(new URL(req.url).searchParams.get('demo')==='1');
  if(!tenant)return json({error:'Workspace access is required.'},401);
  let body:unknown;
  try{body=await req.json()}catch{return json({error:'Confirm deletion before removing this request.'},400)}
  if(!body||typeof body!=='object'||!('confirm' in body)||body.confirm!==true)return json({error:'Confirm deletion before removing this request.'},400);
  const {id}=await params;
  const result=await db().prepare('DELETE FROM requests WHERE tenant=? AND id=?').bind(tenant,id).run();
  if(!result.meta.changes)return json({error:'Request not found or already deleted.'},404);
  return json({ok:true});
 }catch(e){return unavailable(e)}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  if(!sameOrigin(req))return json({error:'Please update from the workspace.'},403);
  const tenant=await access(new URL(req.url).searchParams.get('demo')==='1');
  if(!tenant)return json({error:'Workspace access is required.'},401);
  let body;try{body=await req.json()}catch{return json({error:'Invalid update.'},400)}
  const parsed=updateSchema.safeParse(body);
  if(!parsed.success)return json({error:parsed.error.issues[0].message},400);
  const {id}=await params;
  const row=await db().prepare('SELECT status,scheduled_at,duration_minutes,travel_minutes FROM requests WHERE tenant=? AND id=?').bind(tenant,id).first<{status:string;scheduled_at:string|null;duration_minutes:number;travel_minutes:number}>();
  if(!row)return json({error:'Request not found.'},404);
  const b=parsed.data;
  const transitions:Record<string,string[]>={new:['confirmed','declined'],confirmed:['completed','declined'],completed:[],declined:['new']};
  if(b.status&&b.status!==row.status&&!transitions[row.status].includes(b.status))return json({error:'This request has changed. Refresh before updating.'},409);
  if(b.status==='confirmed'&&(!b.scheduledAt||b.scheduledAt.slice(0,10)<today()||b.durationMinutes===undefined||b.travelMinutes===undefined))return json({error:'Choose an agreed date, time, visit duration, and travel time.'},400);
  if((b.scheduledAt||b.durationMinutes!==undefined||b.travelMinutes!==undefined)&&b.status!=='confirmed')return json({error:'Set the reserved time when confirming the request.'},400);
  const scheduled=b.status==='new'?null:b.scheduledAt||row.scheduled_at;
  const duration=b.durationMinutes??row.duration_minutes;
  const travel=b.travelMinutes??row.travel_minutes;
  let availableAt:string|null=null;
  if(b.status==='confirmed'){
   try{availableAt=visitInterval(scheduled!,duration,travel).availableAt}catch(e){return json({error:e instanceof Error?e.message:'Choose a valid reserved time.'},400)}
   const clash=await db().prepare("SELECT id FROM requests WHERE tenant=? AND status='confirmed' AND id != ? AND datetime(scheduled_at) < datetime(?) AND datetime(scheduled_at, '+' || (duration_minutes + travel_minutes) || ' minutes') > datetime(?)").bind(tenant,id,availableAt,scheduled).first();
   if(clash)return json({error:'Another confirmed visit overlaps this visit or travel time. Choose a free time.'},409);
  }
  // Repeat the overlap check in the write so simultaneous confirmations cannot
  // both reserve the same professional's time after passing the initial read.
  const result=await db().prepare("UPDATE requests SET status=?,scheduled_at=?,duration_minutes=?,travel_minutes=?,seen=1,updated_at=? WHERE tenant=? AND id=? AND status=? AND (? != 'confirmed' OR NOT EXISTS (SELECT 1 FROM requests other WHERE other.tenant=? AND other.status='confirmed' AND other.id != ? AND datetime(other.scheduled_at) < datetime(?) AND datetime(other.scheduled_at, '+' || (other.duration_minutes + other.travel_minutes) || ' minutes') > datetime(?)))").bind(b.status||row.status,scheduled,duration,travel,new Date().toISOString(),tenant,id,row.status,b.status||row.status,tenant,id,availableAt,scheduled).run();
  if(!result.meta.changes)return json({error:'The request changed or this time was just reserved. Refresh and choose a free time.'},409);
  return json({ok:true});
 }catch(e){return unavailable(e)}
}
