import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { runtime } from './data';
const COOKIE='grooming_demo';
async function signature(value:string){const secret=runtime().DEMO_SECRET;if(!secret) throw new Error('Demo is not configured');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function demoSession(){const value=(await cookies()).get(COOKIE)?.value;if(!value)return null;const [id,expires,sig]=value.split('.');if(!/^[a-f0-9-]{36}$/.test(id)||!/^\d+$/.test(expires)||Number(expires)<Date.now()||!sig)return null;const expected=await signature(id+'.'+expires);if(expected.length!==sig.length)return null;let mismatch=0;for(let i=0;i<sig.length;i++)mismatch|=expected.charCodeAt(i)^sig.charCodeAt(i);return mismatch?null:'demo:'+id;}
export async function createDemoCookie(){const id=crypto.randomUUID(),expires=String(Date.now()+86400000),value=id+'.'+expires;return {tenant:'demo:'+id,cookie:`${COOKIE}=${value}.${await signature(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.NODE_ENV==='production'?'; Secure':''}`};}
export async function access(demo:boolean){if(demo)return demoSession();const user=await getChatGPTUser();const owner=runtime().OWNER_EMAIL;if(!owner||!user||user.email.toLowerCase()!==owner.toLowerCase())return null;return 'kevin';}
