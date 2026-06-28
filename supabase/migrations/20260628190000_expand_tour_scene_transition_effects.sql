-- Widen the per-scene transition-effect constraint for newly supported render effects.
-- This only changes validation; it does not delete or transform existing scene data.

alter table public.tour_scenes
  drop constraint if exists tour_scenes_transition_effect_check;

alter table public.tour_scenes
  add constraint tour_scenes_transition_effect_check
  check (
    transition_effect in (
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
