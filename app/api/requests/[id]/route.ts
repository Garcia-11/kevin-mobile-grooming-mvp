import { access } from '@/lib/auth';
import { db,json,sameOrigin,unavailable } from '@/lib/data';
import { updateSchema,today } from '@/lib/validation';
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
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{if(!sameOrigin(req))return json({error:'Please update from the workspace.'},403);const tenant=await access(new URL(req.url).searchParams.get('demo')==='1');if(!tenant)return json({error:'Workspace access is required.'},401);let body;try{body=await req.json()}catch{return json({error:'Invalid update.'},400)}const parsed=updateSchema.safeParse(body);if(!parsed.success)return json({error:parsed.error.issues[0].message},400);const {id}=await params;const row=await db().prepare('SELECT status,scheduled_at FROM requests WHERE tenant=? AND id=?').bind(tenant,id).first<{status:string;scheduled_at:string|null}>();if(!row)return json({error:'Request not found.'},404);const b=parsed.data;const transitions:Record<string,string[]>={new:['confirmed','declined'],confirmed:['completed','declined'],completed:[],declined:['new']};if(b.status&&b.status!==row.status&&!transitions[row.status].includes(b.status))return json({error:'This request has changed. Refresh before updating.'},409);if(b.status==='confirmed'&&(!b.scheduledAt||b.scheduledAt.slice(0,10)<today()))return json({error:'Choose today or a future date and an agreed time.'},400);if(b.scheduledAt&&b.status!=='confirmed')return json({error:'Set the date when confirming the request.'},400);const scheduled=b.status==='new'?null:b.scheduledAt||row.scheduled_at;if(b.status==='confirmed'){const clash=await db().prepare("SELECT id FROM requests WHERE tenant=? AND status='confirmed' AND scheduled_at=? AND id != ?").bind(tenant,scheduled,id).first();if(clash)return json({error:'Another visit already starts at this time. Please agree on a different time.'},409);}const result=await db().prepare("UPDATE requests SET status=?,scheduled_at=?,seen=1,updated_at=? WHERE tenant=? AND id=? AND status=? AND (? != 'confirmed' OR NOT EXISTS (SELECT 1 FROM requests other WHERE other.tenant=? AND other.status='confirmed' AND other.scheduled_at=? AND other.id != ?))").bind(b.status||row.status,scheduled,new Date().toISOString(),tenant,id,row.status,b.status||row.status,tenant,scheduled,id).run();if(!result.meta.changes)return json({error:'The request was updated elsewhere. Refresh and try again.'},409);return json({ok:true});}catch(e){return unavailable(e)}}
