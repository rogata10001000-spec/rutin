-- Add cast style summary for AI draft context
alter table if exists public.staff_profiles
  add column if not exists style_summary text null,
  add column if not exists style_updated_at timestamptz null;

comment on column public.staff_profiles.style_summary is 'キャストの返信スタイル要約（AI返信案の文脈用、200-300文字）';
comment on column public.staff_profiles.style_updated_at is 'スタイル要約の最終更新日時';
