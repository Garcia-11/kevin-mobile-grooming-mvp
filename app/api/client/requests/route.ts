import { usesSupabase,session,sb,reply,sbFailure,type Session } from '@/lib/supabase';
import type { Booking } from '@/lib/validation';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!usesSupabase())return reply({error:'Customer accounts are not available yet.'},503);
 let auth:Session|null=null;
 try{
  auth=await session(req);if(!auth)return reply({error:'Please sign in to view your visits.'},401);
  // RLS independently enforces ownership even if the HTTP filter is removed.
  const rows=await sb<Booking[]>('/rest/v1/grooming_requests?select=*&client_id=eq.'+auth.user.id+'&tenant=eq.kevin&order=created_at.desc&limit=500',auth.token);
  return reply({requests:rows.map(r=>({...r,scheduled_at:r.scheduled_at?.slice(0,16)||null}))},200,auth);
 }catch(e){return sbFailure(e,auth)}
}
