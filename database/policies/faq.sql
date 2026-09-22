alter table faqs enable row level security;
drop policy if exists faq_public on faqs;
create policy faq_public on faqs for select to anon, authenticated using (is_published=true);
