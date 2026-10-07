'use client';
import { useEffect,useState } from 'react';
export type BrowserSession={configured:boolean;authenticated:boolean;admin?:boolean;email?:string;error?:string};
export function SignOut(){const [busy,setBusy]=useState(false),[error,setError]=useState('');return <><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw new Error('Could not sign out. Please try again.');location.assign('/login');}catch(e){setError(e instanceof Error?e.message:'Could not sign out.');setBusy(false);}}}>{busy?'Signing out…':'Sign out'}</button>{error&&<span className="error" role="alert">{error}</span>}</>}
export function CustomerNavigation(){const [auth,setAuth]=useState<BrowserSession|null>(null);useEffect(()=>{fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(d=>setAuth(d as BrowserSession)).catch(()=>{});},[]);return <nav className="account-nav" aria-label="Customer account">{auth?.authenticated?<><a className="text-link" href="/account">My visits</a><SignOut/></>:<a className="text-link" href="/login">Customer sign in</a>}</nav>}
export function AccountGate({children,admin=false,booking=false}:{children:React.ReactNode;admin?:boolean;booking?:boolean}){
 const [auth,setAuth]=useState<BrowserSession|null>(null),[error,setError]=useState('');
 async function check(){setError('');try{const r=await fetch('/api/auth/session',{cache:'no-store'});const d=await r.json() as BrowserSession;if(!r.ok)throw new Error(d.error||'Could not check your sign-in.');setAuth(d);}catch(e){setError(e instanceof Error?e.message:'Could not check your sign-in.');}}
 useEffect(()=>{void check()},[]);
 if(error)return <section className="form-card account-gate"><p className="error" role="alert">{error}</p><button className="secondary" onClick={()=>void check()}>Try again</button></section>;
 if(!auth)return <section className="form-card account-gate" role="status">Checking your sign-in…</section>;
 if(!auth.configured)return <section className="form-card account-gate"><h2>Customer accounts are being prepared</h2><p>Use the booking page to request a visit.</p><a className="primary" href="/">Open booking page</a></section>;
 if(!auth.authenticated)return <section className="form-card account-gate"><h2>{admin?'Admin sign in':booking?'Sign in to request a visit':'Your visits, in one place'}</h2><p>{admin?'The business owner can review requests and manage the schedule.':'Use your account to send a request and keep track of your visits.'}</p><a className="primary full" href={admin?'/admin/login':'/login'}>Sign in</a>{!admin&&<a className="secondary full" href="/login?mode=signup">Create a customer account</a>}</section>;
 if(admin&&!auth.admin)return <section className="form-card account-gate"><h2>Admin access required</h2><p>This account can view its own visits. The admin area is reserved for the business owner.</p><a className="primary" href="/account">View my visits</a><SignOut/></section>;
 return <>{children}</>;
}
