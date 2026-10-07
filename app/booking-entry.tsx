'use client';
import { useState,useEffect } from 'react';
import BookingForm from './booking-form';
import { AccountGate } from './account-controls';
export default function BookingEntry(){const [demo,setDemo]=useState<boolean|null>(null);useEffect(()=>{setDemo(new URLSearchParams(location.search).get('demo')==='1')},[]);if(demo===null)return <section className="form-card" role="status">Loading booking page…</section>;return demo?<BookingForm/>:<AccountGate booking><BookingForm accounts/></AccountGate>}
