import {session,reply,sbFailure,usesSupabase,type Session} from '@/lib/supabase';
import {sameOrigin} from '@/lib/data';
import {notifyBooking} from '@/lib/booking-notifications';
import {z} from 'zod';
export async function POST(req:Request,context:{params:Promise<{id:string}>}){
 let auth:Session|null=null;
 try{
  if(!sameOrigin(req))return reply({error:'Retry from the workspace.'},403);
  if(!usesSupabase())return reply({error:'Email notifications require the account backend.'},409);
  auth=await session(req,new URL(req.url).searchParams.get('demo')==='1');
  if(!auth)return reply({error:'Please sign in to the admin area.'},401);
  if(!auth.admin)return reply({error:'Admin access is required.'},403,auth);
  const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return reply({error:'Request not found.'},404,auth);
  return reply({notification:await notifyBooking(auth,id)},200,auth);
 }catch(e){return sbFailure(e,auth);}
}
