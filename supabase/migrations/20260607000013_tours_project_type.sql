alter table public.tours_projects
  add column if not exists tour_type text;

update public.tours_projects
set tour_type = 'tour_video'
where tour_type is null;

alter table public.tours_projects
  alter column tour_type set default 'tour_video',
  alter column tour_type set not null;

alter table public.tours_projects
  drop constraint if exists tours_projects_tour_type_check,
  add constraint tours_projects_tour_type_check
    check (tour_type in ('tour_video', 'tour_video_voice_over', 'tour_video_avatar'));
