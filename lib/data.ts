import { env } from 'cloudflare:workers';
export function db(){if(!env.DB) throw new Error('Appointment storage is unavailable');return env.DB;}
export const runtime = ()=>env as typeof env & {OWNER_EMAIL?:string;DEMO_SECRET?:string;BOOKING_BACKEND?:string;SUPABASE_URL?:string;SUPABASE_PUBLISHABLE_KEY?:string;BREVO_API_KEY?:string;BREVO_SENDER_EMAIL?:string;BOOKING_SITE_URL?:string};
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');return origin===new URL(req.url).origin;}
export function unavailable(error:unknown){console.error('Appointment operation failed',error instanceof Error?error.message:'unknown error');return json({error:'We could not connect right now. Your details are still here. Please try again.'},503);}
