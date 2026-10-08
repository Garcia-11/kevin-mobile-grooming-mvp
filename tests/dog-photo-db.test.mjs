import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
test('dog photo policies restrict ownership, admin reads, private demos and pending attachments',async()=>{
 const pg=new PGlite({extensions:{btree_gist}});
 try{
 await pg.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema auth,storage to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const f of ['20261007192320_grooming_accounts_and_schedule.sql','20261007193157_grooming_status_conflict_response.sql','20261007205240_booking_emails.sql','20261008001355_dog_photos.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const owner=crypto.randomUUID(),other=crypto.randomUUID(),admin=crypto.randomUUID(),demo=crypto.randomUUID();
 for(const id of [owner,other,admin,demo])await pg.query('insert into auth.users values($1,$2,now())',[id,id+'@example.com']);await pg.query('insert into private.grooming_admins values($1)',[admin]);
 const as=(id,sql,args=[],anonymous=false)=>pg.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,is_anonymous:anonymous})]);return tx.query(sql,args)});
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const payload={requestKey:crypto.randomUUID(),ownerName:'Fictional Owner',phone:'+1 202 555 0140',dogName:'Photo Pup',breed:'Poodle',size:'Small',service:'Full groom',address:'12 Example Street, Demo City',preferredDate:day,timeWindow:'Morning',notes:'',website:''};
 const id=(await as(owner,'select public.grooming_submit_request($1) as r',[payload])).rows[0].r.id,path=owner+'/'+id+'/dog.jpg';
 await assert.rejects(as(owner,'select public.grooming_set_photo($1)',[id]),e=>e.code==='P0002');
 await assert.rejects(as(other,"insert into storage.objects(bucket_id,name) values('grooming-dog-photos',$1)",[path]),e=>e.code==='42501');
 await assert.rejects(as(admin,"insert into storage.objects(bucket_id,name) values('grooming-dog-photos',$1)",[path]),e=>e.code==='42501');
 await as(owner,"insert into storage.objects(bucket_id,name) values('grooming-dog-photos',$1)",[path]);
 await as(owner,'select public.grooming_set_photo($1)',[id]);
 assert.equal((await as(owner,'select dog_photo from public.grooming_requests where id=$1',[id])).rows[0].dog_photo,true);
 assert.equal((await as(other,'select * from storage.objects')).rows.length,0);
 assert.equal((await as(admin,'select * from storage.objects')).rows.length,1);
 await assert.rejects(as(other,'select public.grooming_set_photo($1)',[id]),e=>e.code==='P0002');
 await as(demo,'select public.grooming_seed_demo()',[],true);assert.equal((await as(demo,'select * from storage.objects',[],true)).rows.length,0);
 await as(admin,"select public.grooming_manage_request($1,'declined')",[id]);
 await assert.rejects(as(owner,'select public.grooming_set_photo($1)',[id]),e=>e.code==='P0409');
 assert.equal((await as(owner,"update storage.objects set name=$1 where name=$1 returning id",[path])).rows.length,0);
 assert.equal((await as(admin,"delete from storage.objects where name=$1 returning id",[path])).rows.length,1);
 // Orphan cleanup remains available only to the uploader if a request disappears mid-upload.
 await pg.query("insert into storage.objects(bucket_id,name) values('grooming-dog-photos',$1)",[path]);await as(admin,'select public.grooming_delete_request($1,true)',[id]);
 assert.equal((await as(owner,'select * from storage.objects')).rows.length,1,'uploader retains access to clean up their own orphan');
 assert.equal((await as(other,'delete from storage.objects returning id')).rows.length,0);
 assert.equal((await as(owner,'delete from storage.objects returning id')).rows.length,1);
 }finally{await pg.close()}
});
