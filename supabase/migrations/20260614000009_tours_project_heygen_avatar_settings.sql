alter table public.tours_projects
  add column if not exists heygen_avatar_id text,
  add column if not exists heygen_avatar_placement jsonb;

alter table public.tours_projects
  drop constraint if exists tours_projects_heygen_avatar_placement_check,
  add constraint tours_projects_heygen_avatar_placement_check
    check (
      heygen_avatar_placement is null
      or (
        heygen_avatar_placement ? 'frame'
        and heygen_avatar_placement ? 'offsets'
        and heygen_avatar_placement #>> '{frame,width}' = '1080'
        and heygen_avatar_placement #>> '{frame,height}' = '1920'
        and jsonb_typeof(heygen_avatar_placement #> '{offsets,top}') = 'number'
        and jsonb_typeof(heygen_avatar_placement #> '{offsets,left}') = 'number'
        and jsonb_typeof(heygen_avatar_placement #> '{offsets,bottom}') = 'number'
        and jsonb_typeof(heygen_avatar_placement #> '{offsets,right}') = 'number'
        and (heygen_avatar_placement #>> '{offsets,top}')::numeric between -3840 and 3840
        and (heygen_avatar_placement #>> '{offsets,left}')::numeric between -3840 and 3840
        and (heygen_avatar_placement #>> '{offsets,bottom}')::numeric between -3840 and 3840
        and (heygen_avatar_placement #>> '{offsets,right}')::numeric between -3840 and 3840
        and 1080 - (heygen_avatar_placement #>> '{offsets,left}')::numeric - (heygen_avatar_placement #>> '{offsets,right}')::numeric > 0
        and 1920 - (heygen_avatar_placement #>> '{offsets,top}')::numeric - (heygen_avatar_placement #>> '{offsets,bottom}')::numeric > 0
      )
    );
