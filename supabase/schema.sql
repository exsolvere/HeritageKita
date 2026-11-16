create table threads (
  id bigint generated always as identity primary key,
  site_id text not null,
  kind text not null check (kind in ('cerita','foto','kerusakan','tanya')),
  title text not null,
  body text,
  image_url text,
  author_id uuid not null default auth.uid() references auth.users(id),
  author_name text,
  created_at timestamptz default now()
);
create index on threads(site_id, created_at desc);
alter table threads enable row level security;
create policy "read all" on threads for select using (true);
create policy "insert own" on threads for insert to authenticated with check (author_id = auth.uid());
create policy "delete own" on threads for delete to authenticated using (author_id = auth.uid());
insert into storage.buckets (id, name, public) values ('photos','photos',true) on conflict do nothing;
create policy "photos read" on storage.objects for select using (bucket_id='photos');
create policy "photos upload" on storage.objects for insert to authenticated with check (bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
