# Issue 0002: Extract Config-Driven Product Header

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

`BlogEngineHeader`, `RadarHeader`, and `HyperlocalHeader` duplicate active-route logic, logo layout, desktop tab nav, mobile dropdown nav, mobile menu close behavior, `AppSwitcher`, and `UserMenu`.

## Scope

- Add a shared `ProductHeader` under `components/app-shell` or another shared UI location.
- Make the header config-driven with app-specific slots for usage badges, help buttons, and modals.
- Keep product-specific wrappers for Blog Engine, Radar, and Hyperlocal thin.
- Extract a shared help icon/button rather than repeating inline SVG markup.

## Acceptance Criteria

- Repeated header frame markup is removed from product-specific headers.
- Header props support:
  - home href
  - nav items
  - active route behavior
  - accent styling
  - desktop right slot
  - mobile extra slot
- Blog Engine and Radar still show usage badges, help modals, and upgrade modals.
- Hyperlocal still renders the same nav and user menu behavior.
- Mobile menu opens, closes, and route-change reset still work.

## QA

- Run the repo's type/lint check if available.
- Inspect desktop and mobile header behavior for:
  - Blog Engine dashboard/settings
  - Radar dashboard/settings
  - Hyperlocal dashboard/settings

## Notes

Avoid pulling usage fetching into the shared header unless the resulting API stays small. Slots are preferable for the first pass.
