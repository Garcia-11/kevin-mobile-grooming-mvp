import * as legacy from '@/lib/legacy/requests';
import { usesSupabase,session,sb,reply,sbFailure,type Session } from '@/lib/supabase';
import { json,sameOrigin } from '@/lib/data';
import { bookingSchema,type Booking } from '@/lib/validation';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!usesSupabase())return legacy.GET(req);
 let auth:Session|null=null;
 try{auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  if(!auth)return reply({error:'Please sign in to the admin area.'},401);
  if(!auth.admin)return reply({error:'Admin access is required.'},403,auth);
  const rows=await sb<Booking[]>('/rest/v1/grooming_requests?select=*&order=created_at.desc&limit=500',auth.token);
  return reply({requests:rows.map(r=>({...r,scheduled_at:r.scheduled_at?.slice(0,16)||null}))},200,auth);
 }catch(e){return sbFailure(e,auth)}
}
export async function POST(req:Request){
 if(!usesSupabase())return legacy.POST(req);
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return json({error:'Please submit from the booking page.'},403);
  const raw=await req.text();if(raw.length>16000)return json({error:'Request is too large.'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Please check the form and try again.'},400)}
  const parsed=bookingSchema.safeParse(body);if(!parsed.success)return json({error:parsed.error.issues[0].message},400);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  if(!auth)return reply({error:'Please sign in before sending your request. Your form is still here.'},401);
  const saved=await sb('/rest/v1/rpc/grooming_submit_request',auth.token,{method:'POST',body:JSON.stringify({payload:parsed.data})});
  return reply(saved,201,auth);
 }catch(e){return sbFailure(e,auth)}
}
