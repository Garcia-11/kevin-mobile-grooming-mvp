import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

test('PostgreSQL enforces account isolation, admin roles, demo scoping and full visit intervals',async()=>{
 const pg=new PGlite({extensions:{btree_gist}});
 try{
  await pg.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema auth to authenticated;
   grant execute on function auth.uid(),auth.jwt() to authenticated;`);
  await pg.exec(await readFile(new URL('../supabase/migrations/20261007192320_grooming_accounts_and_schedule.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../supabase/migrations/20261007193157_grooming_status_conflict_response.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../supabase/migrations/20261007205240_booking_emails.sql',import.meta.url),'utf8'));
  const admin=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID(),demoA=crypto.randomUUID(),demoB=crypto.randomUUID();
  for(const id of [admin,a,b,demoA,demoB])await pg.query('insert into auth.users(id) values($1)',[id]);
  await pg.query('insert into private.grooming_admins values($1)',[admin]);
  async function as(id,anonymous,fn){return pg.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,is_anonymous:anonymous,user_metadata:{role:'admin'}})]);return fn(tx);});}
  const query=(id,sql,params=[],anonymous=false)=>as(id,anonymous,tx=>tx.query(sql,params));
  async function rejected(id,sql,params,code,anonymous=false){await assert.rejects(query(id,sql,params,anonymous),e=>e.code===code);}
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  function payload(){return {requestKey:crypto.randomUUID(),ownerName:'Fictional Client',phone:'+1 202 555 0140',email:'test@example.com',dogName:'Test Pup',breed:'Poodle',size:'Small',service:'Full groom',address:'12 Example Street, Demo City',preferredDate:day,timeWindow:'Morning',notes:'',website:''};}
  const one=payload();
  const submit=async(id,p=payload(),demo=false)=>(await query(id,'select public.grooming_submit_request($1::jsonb) as saved',[JSON.stringify(p)],demo)).rows[0].saved.id;
  const first=await submit(a,one),second=await submit(b);
  assert.equal(await submit(a,one),first,'retry preserves the receipt');
  assert.equal((await query(a,'select * from public.grooming_requests')).rows.length,1);
  assert.equal((await query(b,'select * from public.grooming_requests where id=$1',[first])).rows.length,0,'other customer cannot read a guessed id');
  assert.equal((await query(a,'select public.grooming_is_admin() as admin')).rows[0].admin,false,'user-editable role metadata grants no admin rights');
  assert.equal((await query(admin,'select * from public.grooming_requests')).rows.length,2);
  await rejected(a,"select public.grooming_manage_request($1,'declined')",[first],'42501');
  await rejected(a,'select public.grooming_delete_request($1,true)',[first],'42501');
  await rejected(a,'update public.grooming_requests set status=$1 where id=$2',['confirmed',first],'42501');
  await rejected(a,'insert into private.grooming_admins values($1)',[a],'42501');
  await rejected(a,'select public.grooming_seed_demo()',[],'42501');
  // A direct database caller cannot skip confirmation details or transitions.
  await rejected(admin,"select public.grooming_manage_request($1,'confirmed')",[first],'22023');
  await rejected(admin,"select public.grooming_manage_request($1,'completed')",[first],'P0409');
  const confirm=(id,start,duration=60,travel=20)=>query(admin,"select public.grooming_manage_request($1,'confirmed',$2, $3,$4)",[id,day+' '+start,duration,travel]);
  await confirm(first,'10:00');
  await assert.rejects(confirm(second,'10:30'),e=>e.code==='23P01','service overlap rejected');
  await assert.rejects(confirm(second,'11:10'),e=>e.code==='23P01','travel buffer overlap rejected');
  await assert.rejects(confirm(second,'09:30'),e=>e.code==='23P01','visit ending after another start is rejected');
  await confirm(second,'11:20',30,0);
  assert.equal((await query(a,'select status from public.grooming_requests')).rows[0].status,'confirmed');
  await query(admin,"select public.grooming_manage_request($1,'declined')",[first]);
  const third=await submit(a);await confirm(third,'10:00',60,20);
  await rejected(admin,'select public.grooming_delete_request($1,null)',[third],'22023');
  await query(admin,'select public.grooming_delete_request($1,true)',[third]);
  assert.equal((await query(a,'select * from public.grooming_requests where id=$1',[third])).rows.length,0,'deleted details remain absent');
  for(const id of [demoA,demoB])await query(id,'select public.grooming_seed_demo()',[],true);
  assert.equal((await query(demoA,'select * from public.grooming_requests',[],true)).rows.length,4);
  assert.equal((await query(admin,'select * from public.grooming_requests')).rows.length,2,'admin real inbox excludes demos');
  const practice=await submit(demoA,payload(),true);
  assert.equal((await query(demoB,'select * from public.grooming_requests where id=$1',[practice],true)).rows.length,0);
  await rejected(demoB,'select public.grooming_delete_request($1,true)',[practice],'P0002',true);
  await rejected(demoA,'select public.grooming_delete_request($1,true)',[first],'P0002',true);
  await query(demoA,'select public.grooming_delete_request($1,true)',[practice],true);
  await query(demoA,'select public.grooming_seed_demo()',[],true);
  assert.equal((await query(demoA,'select * from public.grooming_requests',[],true)).rows.length,4,'fixtures are seeded once');
  await pg.query("update private.grooming_demo_sessions set created_at=now()-interval '25 hours' where user_id=$1",[demoA]);
  await rejected(demoA,'select * from public.grooming_requests',[],'42501',true);
  await pg.transaction(async tx=>{await tx.exec('set local role anon');await assert.rejects(tx.query('select * from public.grooming_requests'),e=>e.code==='42501');});
  // The original public form had no user id. Imported rows stay owner-only.
  await pg.query('update public.grooming_requests set client_id=null where id=$1',[first]);
  assert.equal((await query(a,'select * from public.grooming_requests where id=$1',[first])).rows.length,0,'unclaimed legacy record is not linked by contact email');
  assert.equal((await query(admin,'select * from public.grooming_requests where id=$1',[first])).rows.length,1);
 }finally{await pg.close();}
});
