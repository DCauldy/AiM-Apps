-- Tours scene camera motion presets: support Auto and hook-oriented motion choices.

alter table public.tour_scenes
  alter column camera_motion set default 'auto';

alter table public.tour_scenes
  drop constraint if exists tour_scenes_camera_motion_check;

alter table public.tour_scenes
  add constraint tour_scenes_camera_motion_check
  check (
    camera_motion in (
      'auto',
      'slow_push',
      'slow_pan',
      'static_hold',
      'hero_reveal',
      'detail_glide',
      'vertical_rise',
      'snap_push'
    )
  );
