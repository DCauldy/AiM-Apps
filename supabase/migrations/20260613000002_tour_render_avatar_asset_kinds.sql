alter table public.tour_render_assets
  drop constraint if exists tour_render_assets_kind_check;

alter table public.tour_render_assets
  add constraint tour_render_assets_kind_check
  check (kind in (
    'script_plan',
    'narration_text',
    'voiceover_audio',
    'voiceover_transcript',
    'avatar_video',
    'avatar_metadata',
    'scene_transitions',
    'scene_durations',
    'scene_clip',
    'joined_scenes',
    'final_video'
  ));
