export type EmailJob={eventId:string;kind:'confirmed'|'cancelled';recipient:string;payload:{ownerName:string;dogName:string;service:string;scheduledAt:string;durationMinutes:number}};
export type EmailConfig={apiKey:string;senderEmail:string;siteUrl:string};
export type EmailOutcome={status:'accepted'|'failed'|'uncertain';messageId?:string;error?:'provider_rejected'|'authentication'|'rate_limited'|'delivery_unknown'};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const email=(value:string)=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export function emailConfigured(config:EmailConfig){try{const url=new URL(config.siteUrl);return Boolean(config.apiKey)&&email(config.senderEmail)&&url.protocol==='https:';}catch{return false;}}
export function bookingEmailContent(job:EmailJob,config:EmailConfig){
 if(!emailConfigured(config)||!email(job.recipient)||!['confirmed','cancelled'].includes(job.kind))throw new Error('Invalid email configuration');
 const p=job.payload;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.scheduledAt)||!Number.isInteger(p.durationMinutes)||p.durationMinutes<15||p.durationMinutes>480)throw new Error('Invalid appointment');
 const d=new Date(p.scheduledAt.slice(0,10)+'T12:00:00Z');
 if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==p.scheduledAt.slice(0,10))throw new Error('Invalid appointment date');
 const h=Number(p.scheduledAt.slice(11,13)),m=Number(p.scheduledAt.slice(14,16));
 if(h>23||m>59)throw new Error('Invalid appointment time');
 const day=d.toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'});
 const clock=`${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
 const cancelled=job.kind==='cancelled';
 const title=cancelled?'Your grooming visit has been cancelled':'Your grooming visit is confirmed';
 const line=cancelled?`Kevin has cancelled ${p.dogName}'s ${p.service} visit scheduled for ${day} at ${clock}.`:`Kevin has confirmed ${p.dogName}'s ${p.service} visit for ${day} at ${clock}.`;
 const follow=cancelled?'This time is no longer reserved. Contact Kevin to discuss another appointment.':`Visit duration: ${p.durationMinutes} minutes. The time and price are as agreed with Kevin.`;
 const link=new URL('/account',config.siteUrl).href;
 const text=`Hi ${p.ownerName},\n\n${line}\nService time zone: America/New_York.\n\n${follow}\n\nSee the current status of your visits: ${link}\n\nKevin's Mobile Grooming`;
 return {sender:{name:"Kevin's Mobile Grooming",email:config.senderEmail},to:[{email:job.recipient}],
  subject:`${cancelled?'Visit cancelled':'Visit confirmed'} — ${p.dogName.replace(/[\r\n\x00-\x1f\x7f]/g,' ').slice(0,60)}`,
  textContent:text,htmlContent:`<!doctype html><html><body style="font:16px Arial,sans-serif;color:#172947;line-height:1.6"><h1 style="font-size:24px">${title}</h1><p>Hi ${escape(p.ownerName)},</p><p>${escape(line)}</p><p>Service time zone: America/New_York.</p><p>${escape(follow)}</p><p><a href="${escape(link)}">View your visits</a></p><p>Kevin’s Mobile Grooming</p></body></html>`,
  headers:{idempotencyKey:job.eventId},tags:['grooming-'+job.kind]};
}
export async function sendBookingEmail(job:EmailJob,config:EmailConfig,transport:typeof fetch=fetch):Promise<EmailOutcome>{
 const body=bookingEmailContent(job,config);
 try{
  const response=await transport('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':config.apiKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
  const data=await response.json().catch(()=>null) as {messageId?:string;code?:string;message?:string}|null;
  if(response.ok&&typeof data?.messageId==='string')return {status:'accepted',messageId:data.messageId.slice(0,200)};
  if(data?.code==='duplicate_parameter'&&/idempoten/i.test(data.message||''))return {status:'accepted'};
  if(response.status===429)return {status:'failed',error:'rate_limited'};
  if([401,403].includes(response.status))return {status:'failed',error:'authentication'};
  if([400,404,405,422].includes(response.status))return {status:'failed',error:'provider_rejected'};
  // A timeout or 5xx may happen after the provider accepted the message.
  // Do not encourage a blind resend that could duplicate it.
  return {status:'uncertain',error:'delivery_unknown'};
 }catch{return {status:'uncertain',error:'delivery_unknown'};}
}
