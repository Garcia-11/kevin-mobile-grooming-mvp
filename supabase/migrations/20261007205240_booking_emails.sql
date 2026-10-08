-- A booking change and its email intent commit together. No email is sent by SQL.
alter table public.grooming_requests
 add column notification_event_id uuid,
 add column notification_kind text check(notification_kind in ('confirmed','cancelled')),
 add column notification_status text check(notification_status in ('pending','processing','accepted','failed','uncertain'));

create table private.grooming_email_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.grooming_requests(id) on delete cascade,
 kind text not null check(kind in ('confirmed','cancelled')),
 status text not null default 'pending' check(status in ('pending','processing','accepted','failed','uncertain','superseded')),
 recipient text,
 payload jsonb not null,
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 locked_until timestamptz,
 claim_token uuid,
 claimed_by uuid references auth.users(id) on delete set null,
 last_error text,
 provider_message_id text,
 created_at timestamptz not null default now()
);
create index grooming_email_events_request on private.grooming_email_events(request_id);
alter table private.grooming_email_events enable row level security;
revoke all on private.grooming_email_events from public,anon,authenticated;

create function private.grooming_queue_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; event_id uuid; recipient text;
begin
 if new.tenant<>'kevin' then return new; end if;
 if new.status='confirmed' and (
  old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at
  or old.duration_minutes is distinct from new.duration_minutes
 ) then kind:='confirmed';
 elsif old.status='confirmed' and new.status='declined' then kind:='cancelled';
 elsif new.status='new' and old.status='declined' or new.status='completed' and old.status='confirmed' and old.notification_status is distinct from 'accepted' then
  update private.grooming_email_events set status='superseded',claim_token=null
  where request_id=new.id and status in ('pending','processing','failed','uncertain');
  new.notification_event_id:=null;new.notification_kind:=null;new.notification_status:=null;
  return new;
 else return new; end if;
 select u.email into recipient from auth.users u
 where u.id=new.client_id and u.email_confirmed_at is not null;
 -- A later booking decision replaces an email that has not been accepted yet.
 update private.grooming_email_events set status='superseded',claim_token=null
 where request_id=new.id and status in ('pending','processing','failed','uncertain');
 insert into private.grooming_email_events(request_id,kind,recipient,payload)
 values(new.id,kind,recipient,jsonb_build_object(
  'ownerName',new.owner_name,'dogName',new.dog_name,'service',new.service,
  'scheduledAt',to_char(new.scheduled_at,'YYYY-MM-DD"T"HH24:MI'),
  'durationMinutes',new.duration_minutes)) returning id into event_id;
 new.notification_event_id:=event_id;
 new.notification_kind:=kind;
 new.notification_status:='pending';
 return new;
end;
$$;
revoke all on function private.grooming_queue_email() from public,anon,authenticated;
create trigger grooming_booking_email before update of status,scheduled_at,duration_minutes
 on public.grooming_requests for each row execute function private.grooming_queue_email();

-- These narrow RPCs must use definer rights to access the private outbox and
-- verified Auth email. They never accept a recipient, body, or admin identity.
create function public.grooming_claim_email(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.grooming_requests; e private.grooming_email_events;
 verified_email text; lease uuid;
begin
 if auth.uid() is null or not public.grooming_is_admin() then raise insufficient_privilege; end if;
 select * into r from public.grooming_requests where id=p_request_id and tenant='kevin' for update;
 if not found then raise no_data_found; end if;
 if r.notification_event_id is null then return jsonb_build_object('status','none'); end if;
 select * into e from private.grooming_email_events where id=r.notification_event_id for update;
 if not found then raise no_data_found; end if;
 if e.status in ('accepted','superseded','uncertain') then return jsonb_build_object('status',e.status); end if;
 if e.locked_until>now() then return jsonb_build_object('status','busy'); end if;
 -- A crashed or timed-out send is only retried inside the provider's dedup window.
 -- We conservatively use 15 minutes (Brevo currently documents a 30 minute TTL).
 if e.status='processing' and e.first_attempt_at<now()-interval '15 minutes' then
  update private.grooming_email_events set status='uncertain',last_error='delivery_unknown' where id=e.id;
  update public.grooming_requests set notification_status='uncertain' where id=r.id;
  return jsonb_build_object('status','uncertain');
 end if;
 if e.attempts>=20 then return jsonb_build_object('status','attempt_limit'); end if;
 select u.email into verified_email from auth.users u where u.id=r.client_id and u.email_confirmed_at is not null;
 if verified_email is null or verified_email is distinct from e.recipient then
  update private.grooming_email_events set status='failed',last_error='recipient_unavailable' where id=e.id;
  update public.grooming_requests set notification_status='failed' where id=r.id;
  return jsonb_build_object('status','recipient_unavailable');
 end if;
 lease:=gen_random_uuid();
 update private.grooming_email_events set status='processing',attempts=attempts+1,
 first_attempt_at=coalesce(first_attempt_at,now()),locked_until=now()+interval '60 seconds',
 claim_token=lease,claimed_by=auth.uid(),last_error=null where id=e.id;
 update public.grooming_requests set notification_status='processing' where id=r.id;
 return jsonb_build_object('status','claimed','eventId',e.id,'claimToken',lease,
  'kind',e.kind,'recipient',e.recipient,'payload',e.payload);
end;
$$;

create function public.grooming_finish_email(p_event_id uuid,p_claim_token uuid,p_outcome text,p_message_id text default null,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.grooming_requests; e private.grooming_email_events;
begin
 if auth.uid() is null or not public.grooming_is_admin() then raise insufficient_privilege; end if;
 if p_outcome not in ('accepted','failed','uncertain') or p_outcome is null
  or length(coalesce(p_message_id,''))>200 or p_error is not null and p_error not in
  ('provider_rejected','provider_unavailable','rate_limited','authentication','recipient_unavailable','delivery_unknown') then raise invalid_parameter_value; end if;
 -- Lock in the same order as claim/cancel: booking first, outbox second.
 select r0.* into r from public.grooming_requests r0 join private.grooming_email_events e0 on e0.request_id=r0.id
 where e0.id=p_event_id and r0.tenant='kevin' for update of r0;
 if not found then raise no_data_found; end if;
 select * into e from private.grooming_email_events where id=p_event_id for update;
 if e.status<>'processing' or e.claim_token is distinct from p_claim_token or e.claimed_by is distinct from auth.uid()
 then return jsonb_build_object('status','stale'); end if;
 update private.grooming_email_events set status=p_outcome,provider_message_id=p_message_id,
 last_error=p_error,claim_token=null,locked_until=case when p_outcome='failed' then now()+interval '10 seconds' else null end where id=e.id;
 update public.grooming_requests set notification_status=p_outcome where id=r.id and notification_event_id=e.id;
 return jsonb_build_object('status',p_outcome);
end;
$$;
revoke all on function public.grooming_claim_email(uuid),public.grooming_finish_email(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.grooming_claim_email(uuid),public.grooming_finish_email(uuid,uuid,text,text,text) to authenticated;
