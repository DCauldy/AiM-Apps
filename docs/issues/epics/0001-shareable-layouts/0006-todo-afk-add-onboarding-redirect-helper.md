# Issue 0006: Add Onboarding Redirect Helper

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

Blog Engine and Radar root app pages duplicate the same server-side auth gate and onboarding-complete redirect flow.

## Scope

- Add a server helper, likely under `lib/apps/onboarding.ts`.
- Use it in Blog Engine and Radar root app pages.
- Keep Hyperlocal out of scope unless its multi-query onboarding condition can be cleanly represented without hiding behavior.

## Acceptance Criteria

- Blog Engine and Radar root pages share auth/onboarding redirect helper code.
- User auth redirect to `/login` remains unchanged.
- Dashboard redirect behavior remains unchanged.
- Welcome screen rendering remains unchanged.
- Helper API is clear enough for Hyperlocal to adopt later.

## QA

- Run the repo's type/lint check if available.
- Verify the helper stays server-only and does not pull client imports into server pages.

## Notes

This is a code duplication cleanup, not a product flow change.
