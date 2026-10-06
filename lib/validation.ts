import { z } from 'zod';
export const services=['Full groom','Bath & brush','Nail trim'] as const;
export const statuses=['new','confirmed','completed','declined'] as const;
export function today(){const d=new Date();return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function validDate(s:string){const d=new Date(s+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
export const bookingSchema=z.object({
 requestKey:z.string().uuid(),ownerName:z.string().trim().min(2,'Enter your full name').max(100),phone:z.string().trim().min(7).max(25).regex(/^[+\d\s().-]+$/,'Enter a valid phone number').refine(v=>v.replace(/\D/g,'').length>=7,'Enter a valid phone number'),
 email:z.union([z.literal(''),z.string().trim().email().max(150)]).default(''),dogName:z.string().trim().min(1).max(60),breed:z.string().trim().min(1).max(80),size:z.enum(['Small','Medium','Large','Extra large']),service:z.enum(services),address:z.string().trim().min(8,'Enter your street address and city').max(250),
 preferredDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validDate,'Choose a valid date').refine(d=>d>=today(),'Choose today or a future date').refine(d=>d<=new Date(Date.now()+180*86400000).toISOString().slice(0,10),'Choose a date within six months'),timeWindow:z.enum(['Morning','Afternoon','Flexible']),notes:z.string().trim().max(1000).default(''),website:z.string().max(0).optional(),
});
export const updateSchema=z.object({status:z.enum(statuses).optional(),seen:z.literal(true).optional(),scheduledAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine(s=>validDate(s.slice(0,10))&&Number(s.slice(11,13))<24&&Number(s.slice(14,16))<60,'Choose a valid date and time').optional()}).strict();
export type Booking={id:string;owner_name:string;phone:string;email:string;dog_name:string;breed:string;size:string;service:string;address:string;preferred_date:string;time_window:string;notes:string;status:typeof statuses[number];scheduled_at:string|null;seen:number;created_at:string;updated_at:string};
