-- All mutations are authorized in database functions. The browser never gets a service key.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create extension if not exists btree_gist with schema extensions;

create table private.grooming_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
create table private.grooming_quota (
 user_id uuid not null references auth.users(id) on delete cascade,
 hour bigint not null, count integer not null, primary key(user_id,hour)
);
create table private.grooming_demo_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.grooming_admins enable row level security;
alter table private.grooming_quota enable row level security;
alter table private.grooming_demo_sessions enable row level security;

create function public.grooming_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from private.grooming_admins where user_id=auth.uid());
$$;
create function private.grooming_scope() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  if exists(select 1 from private.grooming_demo_sessions where user_id=auth.uid() and created_at < now()-interval '24 hours') then raise insufficient_privilege; end if;
  return 'demo:'||auth.uid()::text;
 end if;
 return 'kevin';
end;
$$;

create table public.grooming_requests (
 id uuid primary key default gen_random_uuid(), tenant text not null,
 client_id uuid references auth.users(id) on delete set null,
 request_key uuid not null,
 owner_name text not null check(length(btrim(owner_name)) between 2 and 100),
 phone text not null check(length(phone) between 7 and 25 and phone ~ '^[+0-9 ().-]+$' and length(regexp_replace(phone,'[^0-9]','','g'))>=7),
 email text not null default '' check(length(email)<=150),
 dog_name text not null check(length(btrim(dog_name)) between 1 and 60),
 breed text not null check(length(btrim(breed)) between 1 and 80),
 size text not null check(size in ('Small','Medium','Large','Extra large')),
 service text not null check(service in ('Full groom','Bath & brush','Nail trim')),
 address text not null check(length(btrim(address)) between 8 and 250),
 preferred_date date not null, time_window text not null check(time_window in ('Morning','Afternoon','Flexible')),
 notes text not null default '' check(length(notes)<=1000),
 status text not null default 'new' check(status in ('new','confirmed','completed','declined')),
 scheduled_at timestamp without time zone,
 duration_minutes integer not null default 60 check(duration_minutes between 15 and 480),
 travel_minutes integer not null default 0 check(travel_minutes between 0 and 180),
 seen integer not null default 0 check(seen in (0,1)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant,client_id,request_key),
 check(tenant='kevin' or (client_id is not null and tenant='demo:'||client_id::text)),
 check(status<>'confirmed' or scheduled_at is not null)
);
-- [start,end) permits the next visit exactly when the previous travel ends.
-- PostgreSQL exclusion constraints also protect simultaneous confirmations.
alter table public.grooming_requests add constraint grooming_no_overlap
 exclude using gist (tenant extensions.gist_text_ops with =,
 tsrange(scheduled_at, scheduled_at+(duration_minutes+travel_minutes)*interval '1 minute','[)') with &&)
 where (status='confirmed');
create index grooming_requests_client on public.grooming_requests(client_id,created_at desc);
create index grooming_requests_inbox on public.grooming_requests(tenant,created_at desc);
alter table public.grooming_requests enable row level security;
revoke all on public.grooming_requests from anon,authenticated;
grant select on public.grooming_requests to authenticated;
create policy grooming_read_scope on public.grooming_requests for select to authenticated using (
 tenant=private.grooming_scope() and (client_id=auth.uid() or public.grooming_is_admin())
);
-- Required for the RLS expression; function computes only the caller's namespace.
grant usage on schema private to authenticated;
grant execute on function private.grooming_scope() to authenticated;

create function public.grooming_submit_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope text:=private.grooming_scope(); saved uuid; tally integer;
 preferred date; current_day date:=(now() at time zone 'America/New_York')::date;
begin
 if coalesce(payload->>'website','')<>'' then raise invalid_parameter_value; end if;
 preferred:=(payload->>'preferredDate')::date;
 if preferred is null or preferred<current_day or preferred>current_day+180 then raise invalid_parameter_value; end if;
 select id into saved from public.grooming_requests where tenant=scope and client_id=auth.uid() and request_key=(payload->>'requestKey')::uuid;
 if saved is not null then return jsonb_build_object('id',saved,'status','new'); end if;
 insert into private.grooming_quota(user_id,hour,count) values(auth.uid(),floor(extract(epoch from now())/3600),1)
 on conflict(user_id,hour) do update set count=private.grooming_quota.count+1 returning count into tally;
 if tally>20 then raise exception using errcode='P0429',message='Request limit reached'; end if;
 insert into public.grooming_requests(tenant,client_id,request_key,owner_name,phone,email,dog_name,breed,size,service,address,preferred_date,time_window,notes)
 values(scope,auth.uid(),(payload->>'requestKey')::uuid,btrim(payload->>'ownerName'),btrim(payload->>'phone'),coalesce(btrim(payload->>'email'),''),btrim(payload->>'dogName'),btrim(payload->>'breed'),payload->>'size',payload->>'service',btrim(payload->>'address'),preferred,payload->>'timeWindow',coalesce(btrim(payload->>'notes'),''))
 on conflict(tenant,client_id,request_key) do nothing returning id into saved;
 if saved is null then select id into saved from public.grooming_requests where tenant=scope and client_id=auth.uid() and request_key=(payload->>'requestKey')::uuid; end if;
 return jsonb_build_object('id',saved,'status','new');
end;
$$;

create function public.grooming_manage_request(p_id uuid,p_status text default null,p_start timestamp default null,p_duration integer default null,p_travel integer default null,p_seen boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope text:=private.grooming_scope(); r public.grooming_requests; next_status text;
begin
 if not public.grooming_is_admin() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise insufficient_privilege; end if;
 select * into r from public.grooming_requests where id=p_id and tenant=scope for update;
 if not found then raise no_data_found; end if;
 next_status:=coalesce(p_status,r.status);
 if p_status is not null and (p_status not in ('new','confirmed','completed','declined') or (p_status<>r.status and not (
  (r.status='new' and p_status in ('confirmed','declined')) or
  (r.status='confirmed' and p_status in ('completed','declined')) or
  (r.status='declined' and p_status='new')
 ))) then raise serialization_failure; end if;
 if p_status='confirmed' and (p_start is null or p_duration is null or p_travel is null or p_start::date < (now() at time zone 'America/New_York')::date) then raise invalid_parameter_value; end if;
 if p_status is distinct from 'confirmed' and (p_start is not null or p_duration is not null or p_travel is not null) then raise invalid_parameter_value; end if;
 update public.grooming_requests set status=next_status,
 scheduled_at=case when p_status='new' then null else coalesce(p_start,r.scheduled_at) end,
 duration_minutes=coalesce(p_duration,r.duration_minutes), travel_minutes=coalesce(p_travel,r.travel_minutes),
 seen=case when p_seen or p_status is not null then 1 else r.seen end,updated_at=now()
 where id=p_id;
 return jsonb_build_object('ok',true);
end;
$$;
create function public.grooming_delete_request(p_id uuid,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope text:=private.grooming_scope();
begin
 if p_confirm is distinct from true then raise invalid_parameter_value; end if;
 if not public.grooming_is_admin() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise insufficient_privilege; end if;
 delete from public.grooming_requests where id=p_id and tenant=scope;
 if not found then raise no_data_found; end if;
 return jsonb_build_object('ok',true);
end;
$$;
create function public.grooming_seed_demo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope text:=private.grooming_scope(); inserted integer; day date:=(now() at time zone 'America/New_York')::date;
begin
 if not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise insufficient_privilege; end if;
 insert into private.grooming_demo_sessions(user_id) values(auth.uid()) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('ok',true); end if;
 insert into public.grooming_requests(tenant,client_id,request_key,owner_name,phone,email,dog_name,breed,size,service,address,preferred_date,time_window,notes,status,scheduled_at,seen,created_at)
 values
 (scope,auth.uid(),gen_random_uuid(),'Maya Wilson','+1 202 555 0110','demo@example.com','Charlie','Goldendoodle','Medium','Full groom','24 Oak Street, Demo City',day+2,'Morning','Charlie can be nervous around dryers.','new',null,0,now()),
 (scope,auth.uid(),gen_random_uuid(),'Alex Morgan','+1 202 555 0111','demo@example.com','Luna','Cocker Spaniel','Medium','Bath & brush','18 Cedar Lane, Demo City',day+1,'Afternoon','Please ring the side doorbell.','confirmed',(day+1)+time '14:00',1,now()-interval '30 minutes'),
 (scope,auth.uid(),gen_random_uuid(),'Jamie Lee','+1 202 555 0112','demo@example.com','Milo','Corgi','Small','Nail trim','7 Park Avenue, Demo City',day+3,'Flexible','First visit!','new',null,0,now()-interval '60 minutes'),
 (scope,auth.uid(),gen_random_uuid(),'Sam Rivera','+1 202 555 0113','demo@example.com','Daisy','Labrador','Large','Bath & brush','36 Maple Road, Demo City',day-1,'Morning','','completed',null,1,now()-interval '90 minutes');
 return jsonb_build_object('ok',true);
end;
$$;
-- PostgreSQL grants EXECUTE to PUBLIC by default; revoke it explicitly.
revoke all on function public.grooming_is_admin(),public.grooming_submit_request(jsonb),public.grooming_manage_request(uuid,text,timestamp,integer,integer,boolean),public.grooming_delete_request(uuid,boolean),public.grooming_seed_demo(),private.grooming_scope() from public,anon;
grant execute on function public.grooming_is_admin(),public.grooming_submit_request(jsonb),public.grooming_manage_request(uuid,text,timestamp,integer,integer,boolean),public.grooming_delete_request(uuid,boolean),public.grooming_seed_demo(),private.grooming_scope() to authenticated;
