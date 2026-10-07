import { access } from '@/lib/auth';
import { getChatGPTUser,chatGPTSignInPath } from '@/app/chatgpt-auth';
import Dashboard from './workspace';
import { usesSupabase } from '@/lib/supabase';
import { AccountGate } from '@/app/account-controls';
export const dynamic='force-dynamic';
async function Protected({demo}:{demo:boolean}){const tenant=await access(demo);if(tenant)return <Dashboard demo={demo}/>;if(demo)return <main className="demo-start form-card"><h1>Open a practice workspace</h1><p>Your practice session is missing or expired.</p><a className="primary" href="/demo">Open demo</a></main>;const user=await getChatGPTUser();return <main className="demo-start form-card"><h1>Kevin’s workspace</h1><p className="muted">Client contact details are only available to the business owner.</p>{!user?<a className="primary" href={chatGPTSignInPath('/dashboard')} target="_top">Sign in with ChatGPT</a>:<p role="alert" className="error">This account does not have access to Kevin’s client appointments.</p>}<a className="secondary demo-back" href="/demo">Explore the practice workspace</a></main>}
export default async function Page({searchParams}:{searchParams:Promise<{demo?:string}>}){const p=await searchParams;return usesSupabase()?(p.demo==='1'?<Dashboard demo/>:<AccountGate admin><Dashboard demo={false} accounts/></AccountGate>):<Protected demo={p.demo==='1'}/>}
