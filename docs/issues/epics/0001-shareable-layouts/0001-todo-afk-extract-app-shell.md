# Issue 0001: Extract Shared App Shell

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

`app/apps/blog-engine/layout-client.tsx`, `app/apps/hyperlocal/layout-client.tsx`, and `app/apps/radar/layout-client.tsx` duplicate the same theme wrapper, toast provider, full-height flex shell, header slot, and main content region.

## Scope

- Add a shared app shell component, likely `components/app-shell/AppShell.tsx`.
- Replace Blog Engine, Hyperlocal, and Radar layout clients with the shared shell.
- Preserve each app's theme class, header component, and current main overflow behavior.
- Leave Prompt Studio unchanged for now.

## Acceptance Criteria

- Blog Engine, Hyperlocal, and Radar layout clients no longer duplicate the shell markup.
- The shared shell supports:
  - theme class name
  - header slot
  - children
  - main class name or overflow mode
  - `ToastProvider`
- Existing app route layout behavior is preserved.
- No unrelated layout or visual redesign is introduced.

## QA

- Run the repo's type/lint check if available.
- Smoke-test or inspect these routes:
  - `/apps/blog-engine`
  - `/apps/hyperlocal`
  - `/apps/radar`

## Notes

This should be the first refactor because it has the lowest stateful complexity and proves the shared component directory shape.
