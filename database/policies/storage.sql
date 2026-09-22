-- Storage policies are defense-in-depth. Application uploads use the server/service key.
drop policy if exists user_upload_owner_select on storage.objects;
create policy user_upload_owner_select on storage.objects for select to authenticated using (bucket_id='user-uploads' and owner_id=(select auth.uid()));
drop policy if exists user_upload_owner_insert on storage.objects;
create policy user_upload_owner_insert on storage.objects for insert to authenticated with check (bucket_id='user-uploads' and owner_id=(select auth.uid()));
drop policy if exists user_upload_owner_update on storage.objects;
create policy user_upload_owner_update on storage.objects for update to authenticated using (bucket_id='user-uploads' and owner_id=(select auth.uid())) with check (bucket_id='user-uploads' and owner_id=(select auth.uid()));
drop policy if exists user_upload_owner_delete on storage.objects;
create policy user_upload_owner_delete on storage.objects for delete to authenticated using (bucket_id='user-uploads' and owner_id=(select auth.uid()));
