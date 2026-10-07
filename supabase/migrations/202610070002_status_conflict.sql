-- Business conflicts must not use 40001: PostgREST retries serialization failures.
create or replace function public.grooming_manage_request(p_id uuid,p_status text default null,p_start timestamp default null,p_duration integer default null,p_travel integer default null,p_seen boolean default false) returns jsonb
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
 ))) then raise exception using errcode='P0409',message='Invalid status transition'; end if;
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
