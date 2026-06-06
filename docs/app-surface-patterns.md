# App Surface Patterns

Use these patterns when adding or refactoring app UI surfaces.

## Shared app shell

Use `components/app-shell/AppShell.tsx` for app layout clients that need the standard AiM app chrome:

- product theme class
- `ToastProvider`
- full-height flex shell
- product header slot
- main content overflow behavior

Keep app-specific layout clients thin. Example shape:

```tsx
"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { ProductSpecificHeader } from "@/components/product/ProductSpecificHeader";

export function ProductLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      themeClassName="product-theme"
      header={<ProductSpecificHeader />}
      mainClassName="overflow-hidden"
    >
      {children}
    </AppShell>
  );
}
```

Use `mainClassName="overflow-auto"` only when the existing product layout requires the main region to own scrolling.

## Product headers

Use `components/app-shell/ProductHeader.tsx` for product nav/header chrome.

Product-specific header wrappers should own:

- nav item config
- home href
- active-route behavior
- accent classes
- usage fetching/badges
- app-specific help/upgrade modals
- app-specific mobile extras

The shared header owns:

- logo/AppSwitcher frame
- desktop nav rendering
- `UserMenu`
- hamburger state
- mobile nav rendering
- route-change mobile-menu reset

Use `ProductHelpButton` instead of repeating inline help SVG markup.

## Welcome screens

Use `components/app-shell/ProductWelcome.tsx` for product welcome/onboarding intro screens.

Product wrappers should be data/config only:

- badge text
- title/description
- stats
- feature cards
- CTA label/href/help text
- accent styling

Do not change server-side onboarding checks while extracting welcome presentation.

## Page and dashboard primitives

Use `components/app-shell/PagePrimitives.tsx` for dashboard/settings/page structure:

- `PageFrame`
- `PageHeader`
- `PageSection`
- `DashboardCard`
- `MetricCard`
- `EmptyState`
- `InlineStatusBanner`
- `SettingsTabs`

These primitives must not encode product-specific routes, colors, copy, or business logic.

## Upgrade dialogs

Use `components/app-shell/PlanUpgradeDialog.tsx` for plan/pack upgrade modals.

Product wrappers should own:

- pack data
- checkout endpoint
- app-specific header copy
- app-specific limit/reset copy
- accent classes/gradients
- plan metadata text

The shared dialog owns:

- overlay/dialog frame
- selected-plan state
- checkout POST flow
- `packId` request body
- redirecting state
- close/reset behavior
- toast error handling
- disabled subscribe button until selection

## Onboarding chat primitives

Use `components/app-shell/OnboardingChatPrimitives.tsx` for presentation only:

- `OnboardingChatFrame`
- `OnboardingChatHeader`
- `ChatMessageList`
- `ChatBubble`
- `TypingIndicator`
- `ChatComposer`

Keep each app's backend transport, draft/finalize logic, confirmation/review data, routing, and state machine local.

## Server onboarding redirects

Use `lib/apps/onboarding.ts` for simple server-side auth + onboarding-complete redirects where the app has a single `user_id` row and an `onboarding_completed` boolean.

Do not force more complex apps into the helper if doing so hides product-specific behavior.

## General rules

- Preserve existing route semantics, auth checks, subscription behavior, checkout behavior, and onboarding state machines.
- Keep product wrappers thin but readable.
- Prefer slots and explicit props over shared components importing product business logic.
- Keep Server Components server-side by default; add `"use client"` only when hooks, browser APIs, event handlers, or client state are required.
- Do not add dependencies for simple UI extraction.
- Leave Prompt Studio out of the shared app shell unless a future issue explicitly scopes it in.
