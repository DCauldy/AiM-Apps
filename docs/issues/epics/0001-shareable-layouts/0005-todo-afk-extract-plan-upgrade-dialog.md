# Issue 0005: Extract Shared Plan Upgrade Dialog

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

Blog Engine and Radar upgrade modals duplicate modal overlay markup, selected-plan state, checkout call flow, tier card layout, close/reset behavior, and CTA footer.

## Scope

- Add a shared `PlanUpgradeDialog`.
- Make plan rendering configurable by app.
- Use the existing dialog primitives if they fit the app themes; update them carefully if needed.
- Keep Blog Engine and Radar wrappers responsible for pack data, endpoint, copy, and app-specific limit text.

## Acceptance Criteria

- `BlogUpgradeModal` and `RadarUpgradeModal` are thin wrappers around shared dialog behavior.
- Checkout endpoint and pack id behavior remain unchanged.
- Blog Engine still supports limit-vs-CTA copy and reset date copy.
- Radar still shows its current plan copy and accent styling.
- Selection, close/reset, redirecting state, and toast error behavior still work.

## QA

- Run the repo's type/lint check if available.
- Open both modals and verify:
  - selecting a tier updates selected state
  - closing resets selection
  - subscribe button stays disabled until selection
  - app-specific copy is intact

## Notes

This issue is stateful. Keep the shared API explicit rather than overly clever.
