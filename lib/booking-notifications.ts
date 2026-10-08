import {runtime} from './data';
import {sb,type Session} from './supabase';
import {sendBookingEmail,emailConfigured,type EmailJob} from './booking-email';
export type NotificationResult={status:string};
export async function notifyBooking(auth:Session,id:string):Promise<NotificationResult>{
 if(auth.demo)return {status:'demo'};
 const env=runtime();const config={apiKey:env.BREVO_API_KEY||'',senderEmail:env.BREVO_SENDER_EMAIL||'',siteUrl:env.BOOKING_SITE_URL||''};
 if(!emailConfigured(config))return {status:'pending'};
 try{
  const claim=await sb<EmailJob&{status:string;claimToken:string}>('/rest/v1/rpc/grooming_claim_email',auth.token,{method:'POST',body:JSON.stringify({p_request_id:id})});
  if(claim.status!=='claimed')return {status:claim.status};
  const result=await sendBookingEmail(claim,config);
  return await sb<NotificationResult>('/rest/v1/rpc/grooming_finish_email',auth.token,{method:'POST',body:JSON.stringify({p_event_id:claim.eventId,p_claim_token:claim.claimToken,p_outcome:result.status,p_message_id:result.messageId||null,p_error:result.error||null})});
 }catch(e){console.error('Booking email could not be completed',e instanceof Error?e.name:'unknown');return {status:'pending'};}
}
