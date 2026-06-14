-- Tours scene source photo deletion: remove one source photo and compact priorities atomically.

create or replace function public.delete_tour_scene_source_photo(
  p_project_id uuid,
  p_scene_id uuid,
  p_source_photo_id uuid default null
)
returns table (
  removed_photo_id uuid,
  removed_storage_path text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_photo public.tour_scene_source_photos%rowtype;
  v_photo_count integer;
  v_temporary_offset integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to remove TourScene listing photos.';
  end if;

  if not exists (
    select 1
    from public.tours_projects project
    join public.tour_scenes scene
      on scene.project_id = project.id
     and scene.id = p_scene_id
    where project.id = p_project_id
      and project.user_id = auth.uid()
      and project.status = 'open'
  ) then
    raise exception 'Tour Project was not found or cannot be updated.';
  end if;

  perform 1
  from public.tour_scene_source_photos photo
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id
  for update;

  select count(*)
  into v_photo_count
  from public.tour_scene_source_photos photo
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id;

  if v_photo_count = 0 then
    raise exception 'TourScene listing photo was not found.';
  end if;

  if v_photo_count = 1 then
    raise exception 'TourScene needs at least one listing photo.';
  end if;

  select *
  into v_photo
  from public.tour_scene_source_photos photo
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id
    and (p_source_photo_id is null or photo.id = p_source_photo_id)
  order by photo.priority asc, photo.created_at asc
  limit 1;

  if not found then
    raise exception 'TourScene listing photo was not found.';
  end if;

  delete from public.tour_scene_source_photos photo
  where photo.id = v_photo.id
    and photo.project_id = p_project_id
    and photo.scene_id = p_scene_id;

  v_temporary_offset := v_photo_count + 10000;

  update public.tour_scene_source_photos photo
  set priority = photo.priority + v_temporary_offset
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id
    and photo.priority > v_photo.priority;

  update public.tour_scene_source_photos photo
  set priority = photo.priority - v_temporary_offset - 1
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id
    and photo.priority >= v_temporary_offset;

  update public.tour_scenes scene
  set updated_at = now()
  where scene.project_id = p_project_id
    and scene.id = p_scene_id;

  return query
  select v_photo.id, v_photo.storage_path;
end;
$$;

drop policy if exists "Users can delete source photos for their open tour projects"
  on public.tour_scene_source_photos;

create policy "Users can delete source photos for their open tour projects"
  on public.tour_scene_source_photos for delete
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  );

revoke all on function public.delete_tour_scene_source_photo(uuid, uuid, uuid) from public;
grant execute on function public.delete_tour_scene_source_photo(uuid, uuid, uuid) to authenticated;
