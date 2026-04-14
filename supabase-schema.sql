-- =====================================================
-- 고령군청소년문화의집 물품기기 관리 앱 - Supabase 스키마
-- =====================================================
-- 사용 방법:
-- 1. Supabase 대시보드 → SQL Editor → New query
-- 2. 아래 SQL 전체를 복사해서 붙여넣기
-- 3. Run 버튼 클릭
-- =====================================================

-- 1) 물품 테이블
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  quantity integer default 0,
  status text default '사용가능',
  location text default '',
  note text default '',
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) 수리 기록 테이블
create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete cascade,
  date date default current_date,
  description text not null,
  photo_url text,
  created_at timestamptz default now()
);

create index if not exists idx_repairs_item_id on public.repairs(item_id);

-- 3) Row Level Security 활성화
alter table public.items enable row level security;
alter table public.repairs enable row level security;

-- 4) 익명 사용자 접근 정책 (로그인 없이 사용)
drop policy if exists "public items access" on public.items;
create policy "public items access" on public.items
  for all using (true) with check (true);

drop policy if exists "public repairs access" on public.repairs;
create policy "public repairs access" on public.repairs
  for all using (true) with check (true);

-- 5) 사진 저장용 Storage 버킷 생성
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- 6) Storage 접근 정책
drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "photos public insert" on storage.objects;
create policy "photos public insert" on storage.objects
  for insert with check (bucket_id = 'photos');

drop policy if exists "photos public delete" on storage.objects;
create policy "photos public delete" on storage.objects
  for delete using (bucket_id = 'photos');

-- 7) 실시간 기능 활성화 (여러 기기 동기화)
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.repairs;
exception when duplicate_object then null;
end $$;
