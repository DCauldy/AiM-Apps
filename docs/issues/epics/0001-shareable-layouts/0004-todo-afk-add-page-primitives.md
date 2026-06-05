# Issue 0004: Add Shared Page And Dashboard Primitives

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

Dashboard and settings pages repeat page frames, max-width containers, page headers, card wrappers, status cards, empty states, and inline banners.

## Scope

- Add reusable primitives such as:
  - `PageFrame`
  - `PageHeader`
  - `PageSection`
  - `DashboardCard`
  - `MetricCard`
  - `EmptyState`
  - `InlineStatusBanner`
  - `SettingsTabs`
- Migrate at least one low-risk app page to prove the API, preferably Hyperlocal dashboard because its local `StatusCard` and `EmptyState` are straightforward.
- Do not rewrite every dashboard in this issue unless the changes remain small.

## Acceptance Criteria

- Shared page primitives exist and are documented by usage.
- At least one existing dashboard or settings page uses the new primitives.
- Visual structure and routes remain unchanged.
- The primitives do not encode product-specific route names, colors, or copy.

## QA

- Run the repo's type/lint check if available.
- Inspect the migrated page on desktop and mobile widths.

## Notes

Prefer simple composition over a large generic dashboard framework.
