-- Tours scene transition effect: persist per-scene transition choices.

alter table public.tour_scenes
  add column if not exists transition_effect text not null default 'swipe-on-top';

alter table public.tour_scenes
  drop constraint if exists tour_scenes_transition_effect_check;

alter table public.tour_scenes
  add constraint tour_scenes_transition_effect_check
  check (transition_effect in ('swipe-on-top'));

drop function if exists public.create_tour_scene_with_source_photo(
  uuid,
  text,
  integer,
  boolean,
  text,
  text,
  text,
  text,
  bigint,
  integer,
  integer,
  integer
);

create or replace function public.create_tour_scene_with_source_photo(
  p_project_id uuid,
  p_title text,
  p_sort_order integer,
  p_included boolean,
  p_camera_motion text,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_priority integer default 0
)
returns table (
  scene_id uuid,
  scene_project_id uuid,
  scene_title text,
  scene_sort_order integer,
  scene_included boolean,
  scene_camera_motion text,
  scene_transition_effect text,
  scene_created_at timestamptz,
  scene_updated_at timestamptz,
  source_photo_id uuid,
  source_photo_project_id uuid,
  source_photo_scene_id uuid,
  source_photo_storage_path text,
  source_photo_file_name text,
  source_photo_content_type text,
  source_photo_byte_size bigint,
  source_photo_width integer,
  source_photo_height integer,
  source_photo_priority integer,
  source_photo_created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_scene public.tour_scenes%rowtype;
  v_source_photo public.tour_scene_source_photos%rowtype;
begin
  insert into public.tour_scenes (
    project_id,
    title,
    sort_order,
    included,
    camera_motion
  )
  values (
    p_project_id,
    p_title,
    p_sort_order,
    p_included,
    p_camera_motion
  )
  returning * into v_scene;

  insert into public.tour_scene_source_photos (
    project_id,
    scene_id,
    storage_path,
    file_name,
    content_type,
    byte_size,
    width,
    height,
    priority
  )
  values (
    p_project_id,
    v_scene.id,
    p_storage_path,
    p_file_name,
    p_content_type,
    p_byte_size,
    p_width,
    p_height,
    p_priority
  )
  returning * into v_source_photo;

  return query
  select
    v_scene.id,
    v_scene.project_id,
    v_scene.title,
    v_scene.sort_order,
    v_scene.included,
    v_scene.camera_motion,
    v_scene.transition_effect,
    v_scene.created_at,
    v_scene.updated_at,
    v_source_photo.id,
    v_source_photo.project_id,
    v_source_photo.scene_id,
    v_source_photo.storage_path,
    v_source_photo.file_name,
    v_source_photo.content_type,
    v_source_photo.byte_size,
    v_source_photo.width,
    v_source_photo.height,
    v_source_photo.priority,
    v_source_photo.created_at;
end;
$$;
