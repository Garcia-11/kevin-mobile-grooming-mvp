'use client';
import {useState,useEffect} from 'react';
import {PawPrint,MailCheck} from 'lucide-react';

export default function ConfirmEmail(){
 const [recovery,setRecovery]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setRecovery(new URLSearchParams(location.search).get('type')==='recovery'),[]);
 async function confirm(){
  if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth/verify',{method:'POST'});
   const result=await response.json() as {error?:string;next?:string};
   if(!response.ok||!result.next)throw new Error(result.error||'Please try again.');
   location.assign(result.next);
  }catch(e){setError(e instanceof Error?e.message:'Could not connect. Please try again.');setBusy(false)}
 }
 return <main className="auth-layout"><a className="brand" href="/"><span className="brand-icon"><PawPrint size={23}/></span><span>Kevin’s<span className="brand-sub">MOBILE GROOMING</span></span></a><section className="form-card auth-card"><span className="auth-icon"><MailCheck size={25}/></span><p className="eyebrow">YOUR GROOMING VISITS</p><h1>{recovery?'Reset your password':'Confirm your email'}</h1><p className="muted">{recovery?'Continue to choose a new password for your account.':'Confirm this email address and continue to your grooming visits.'}</p>{error&&<p className="error" role="alert">{error}</p>}<button className="primary full" disabled={busy} onClick={confirm}>{busy?'Please wait…':recovery?'Continue to reset password':'Confirm email and continue'}</button><div className="auth-links"><a href="/login">Sign in</a><a href="/login?mode=recover">Request a new recovery link</a></div></section></main>;
}
