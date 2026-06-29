-- Let the script planner choose scene transitions by default.

alter table public.tour_scenes
  alter column transition_effect set default 'auto';

alter table public.tour_scenes
  drop constraint if exists tour_scenes_transition_effect_check;

alter table public.tour_scenes
  add constraint tour_scenes_transition_effect_check
  check (
    transition_effect in (
      'auto',
      'swipe-on-top',
      'cross-dissolve',
      'fade',
      'cross-blur',
      'cross-zoom',
      'iris',
      'soft-wipe',
      'split-reveal',
      'whip-pan'
    )
  );
