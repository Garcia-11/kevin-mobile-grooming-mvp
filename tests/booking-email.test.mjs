import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingEmailContent,sendBookingEmail} from '../lib/booking-email.ts';
const config={apiKey:'private-test-key',senderEmail:'owner@example.com',siteUrl:'https://grooming.example.com'};
const job={eventId:crypto.randomUUID(),kind:'confirmed',recipient:'verified@example.com',payload:{ownerName:'Alex <script>alert(1)</script>',dogName:'Jake & Luna',service:'Full groom',scheduledAt:'2026-10-09T10:00',durationMinutes:60}};
test('confirmation and cancellation preserve agreed civil time and escape customer input',()=>{
 const body=bookingEmailContent(job,config);
 assert.match(body.textContent,/Friday, October 9, 2026 at 10:00 AM/);
 assert.match(body.textContent,/America\/New_York/);
 assert.match(body.htmlContent,/&lt;script&gt;/);assert.doesNotMatch(body.htmlContent,/<script>/);
 assert.equal(body.to[0].email,job.recipient);assert.equal(body.headers.idempotencyKey,job.eventId);
 assert.match(body.htmlContent,/https:\/\/grooming.example.com\/account/);
 const cancelled=bookingEmailContent({...job,kind:'cancelled'},config);
 assert.match(cancelled.textContent,/no longer reserved/);assert.match(cancelled.subject,/cancelled/);
 assert.doesNotMatch(JSON.stringify(body),/private-test-key/);
});
test('invalid configuration and appointment data are never sent',async()=>{
 let called=false;const transport=async()=>{called=true;return Response.json({messageId:'x'})};
 await assert.rejects(sendBookingEmail({...job,payload:{...job.payload,scheduledAt:'2026-02-30T10:00'}},config,transport));
 await assert.rejects(sendBookingEmail(job,{...config,siteUrl:'javascript:alert(1)'},transport));
 assert.equal(called,false);
});
test('provider acceptance, safe rejection, duplicate suppression, and ambiguous failures are distinct',async()=>{
 let captured;
 assert.deepEqual(await sendBookingEmail(job,config,async(url,opts)=>{captured={url,opts};return Response.json({messageId:'provider-123'},{status:201});}),{status:'accepted',messageId:'provider-123'});
 assert.equal(captured.url,'https://api.brevo.com/v3/smtp/email');assert.equal(captured.opts.headers['api-key'],config.apiKey);
 assert.deepEqual(await sendBookingEmail(job,config,async()=>Response.json({code:'duplicate_parameter',message:'idempotency key already used'},{status:400})),{status:'accepted'});
 assert.equal((await sendBookingEmail(job,config,async()=>Response.json({},{status:401}))).status,'failed');
 assert.equal((await sendBookingEmail(job,config,async()=>Response.json({},{status:429}))).error,'rate_limited');
 assert.equal((await sendBookingEmail(job,config,async()=>Response.json({},{status:503}))).status,'uncertain');
 assert.equal((await sendBookingEmail(job,config,async()=>{throw new Error('timeout')})).status,'uncertain');
 assert.equal((await sendBookingEmail(job,config,async()=>Response.json({},{status:201}))).status,'uncertain');
});
