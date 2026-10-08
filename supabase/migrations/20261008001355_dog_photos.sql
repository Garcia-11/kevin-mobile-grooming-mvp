-- Create private bucket grooming-dog-photos through the Storage API/dashboard first:
-- public=false, file_size_limit=1048576, allowed_mime_types=['image/jpeg'].
-- Never insert/delete storage metadata through SQL; use the Storage API.
alter table public.grooming_requests add column dog_photo boolean not null default false;

create function private.grooming_photo_access(p_name text,p_upload boolean default false) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/dog[.]jpg$' then return false;end if;
 return exists(select 1 from public.grooming_requests r
  where r.id=split_part(p_name,'/',2)::uuid
  and r.client_id::text=split_part(p_name,'/',1)
  and r.tenant=private.grooming_scope()
  and case when p_upload then r.client_id=auth.uid() and r.status='new'
   else r.client_id=auth.uid() or public.grooming_is_admin() end);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function private.grooming_photo_access(text,boolean) from public,anon;
grant execute on function private.grooming_photo_access(text,boolean) to authenticated;

create policy grooming_photo_read on storage.objects for select to authenticated
using (bucket_id='grooming-dog-photos' and (split_part(name,'/',1)=(select auth.uid())::text or private.grooming_photo_access(name,false)));
create policy grooming_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='grooming-dog-photos' and private.grooming_photo_access(name,true));
create policy grooming_photo_update on storage.objects for update to authenticated
using (bucket_id='grooming-dog-photos' and private.grooming_photo_access(name,true))
with check (bucket_id='grooming-dog-photos' and private.grooming_photo_access(name,true));
create policy grooming_photo_delete on storage.objects for delete to authenticated
using (bucket_id='grooming-dog-photos' and
 (split_part(name,'/',1)=(select auth.uid())::text or private.grooming_photo_access(name,false) and public.grooming_is_admin()));

create function public.grooming_set_photo(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.grooming_requests;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into r from public.grooming_requests where id=p_id and tenant=private.grooming_scope() and client_id=auth.uid() for update;
 if not found then raise no_data_found;end if;
 if r.status<>'new' then raise exception using errcode='P0409',message='Request changed';end if;
 if not exists(select 1 from storage.objects where bucket_id='grooming-dog-photos' and name=auth.uid()::text||'/'||p_id::text||'/dog.jpg') then raise no_data_found;end if;
 update public.grooming_requests set dog_photo=true,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.grooming_set_photo(uuid) from public,anon;
grant execute on function public.grooming_set_photo(uuid) to authenticated;
