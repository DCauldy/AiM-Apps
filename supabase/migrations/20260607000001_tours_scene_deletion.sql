-- Tours scene deletion: remove a scene, cascade owned rows, and compact remaining scene order.

create or replace function public.delete_tour_scene(
  p_project_id uuid,
  p_scene_id uuid
)
returns table (
  removed_storage_path text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_scene public.tour_scenes%rowtype;
  v_scene_count integer;
  v_temporary_offset integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to remove TourScenes.';
  end if;

  if not exists (
    select 1
    from public.tours_projects project
    where project.id = p_project_id
      and project.user_id = auth.uid()
      and project.status = 'open'
  ) then
    raise exception 'Tour Project was not found or cannot be updated.';
  end if;

  select *
  into v_scene
  from public.tour_scenes scene
  where scene.project_id = p_project_id
    and scene.id = p_scene_id
  for update;

  if not found then
    raise exception 'TourScene was not found.';
  end if;

  select count(*)
  into v_scene_count
  from public.tour_scenes scene
  where scene.project_id = p_project_id;

  return query
  select photo.storage_path
  from public.tour_scene_source_photos photo
  where photo.project_id = p_project_id
    and photo.scene_id = p_scene_id
  order by photo.priority asc, photo.created_at asc;

  delete from public.tour_scenes scene
  where scene.project_id = p_project_id
    and scene.id = p_scene_id;

  v_temporary_offset := v_scene_count + 10000;

  update public.tour_scenes scene
  set
    sort_order = scene.sort_order + v_temporary_offset,
    updated_at = now()
  where scene.project_id = p_project_id
    and scene.sort_order > v_scene.sort_order;

  update public.tour_scenes scene
  set
    sort_order = scene.sort_order - v_temporary_offset - 1,
    updated_at = now()
  where scene.project_id = p_project_id
    and scene.sort_order >= v_temporary_offset;
end;
$$;

drop policy if exists "Users can delete scenes for their open tour projects"
  on public.tour_scenes;

create policy "Users can delete scenes for their open tour projects"
  on public.tour_scenes for delete
  using (
    exists (
      select 1
      from public.tours_projects p
      where p.id = project_id
        and p.user_id = auth.uid()
        and p.status = 'open'
    )
  );

revoke all on function public.delete_tour_scene(uuid, uuid) from public;
grant execute on function public.delete_tour_scene(uuid, uuid) to authenticated;
