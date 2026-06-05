# Issue 0003: Extract Product Welcome Screen

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

Blog Engine and Radar welcome screens share the same hero, stat callout, feature grid, and CTA layout with only copy, colors, icons, links, and routes changed.

## Scope

- Add a shared `ProductWelcome` component.
- Convert Blog Engine and Radar welcome screens to data-only wrappers.
- Support optional stat source links for Blog Engine and plain stat source labels for Radar.

## Acceptance Criteria

- `components/blog-engine/WelcomeScreen.tsx` and `components/radar/WelcomeScreen.tsx` no longer duplicate layout markup.
- The shared component supports:
  - badge text
  - title
  - description
  - stats
  - feature cards
  - CTA label and href/action
  - accent styling
- Existing welcome screen copy and navigation behavior are preserved.

## QA

- Run the repo's type/lint check if available.
- Inspect unauthenticated/authenticated onboarding-incomplete flows as practical.
- Verify CTA navigation still points to the correct onboarding route.

## Notes

Keep this as a presentation extraction. Do not modify server-side onboarding checks in this issue.
