# Tech Debt: UI Duplication

This project has several app surfaces that are converging on the same UI structure while keeping separate component trees. The biggest duplication is across Blog Engine, Radar, and Hyperlocal. Prompt Studio has an older shell that overlaps conceptually but is shaped around chat/sidebar state.

## Findings

### App Shell Layouts

- `app/apps/blog-engine/layout-client.tsx`, `app/apps/hyperlocal/layout-client.tsx`, and `app/apps/radar/layout-client.tsx` are effectively the same shell: theme wrapper, `ToastProvider`, full-height flex column, app header, and `main`.
- The only meaningful differences are theme class, header component, and `main` overflow behavior.
- Examples:
  - `app/apps/blog-engine/layout-client.tsx:12`
  - `app/apps/hyperlocal/layout-client.tsx:12`
  - `app/apps/radar/layout-client.tsx:12`

### Product Headers

- `components/blog-engine/BlogEngineHeader.tsx`, `components/hyperlocal/HyperlocalHeader.tsx`, and `components/radar/RadarHeader.tsx` repeat the same header frame:
  - `usePathname` active-route logic
  - mobile menu state and route-change close behavior
  - logo link
  - desktop tab nav
  - mobile dropdown nav
  - `AppSwitcher`
  - `UserMenu`
- Blog Engine and Radar additionally duplicate usage badge fetching, limit CTA behavior, help button SVG markup, and upgrade/help modal wiring.
- Examples:
  - `components/blog-engine/BlogEngineHeader.tsx:33`
  - `components/hyperlocal/HyperlocalHeader.tsx:18`
  - `components/radar/RadarHeader.tsx:28`
- The inline help icon SVG is copied with different gradient ids/colors in Blog Engine and Radar. Prompt Studio also has a similar inline help SVG in `components/layout/Header.tsx`.

### Welcome Screens

- Blog Engine and Radar welcome screens use the same template:
  - centered hero
  - product pill
  - three stat callouts
  - six-card feature grid
  - CTA button
  - local `StatCard`
- Only the data, color, CTA href, and optional stat links differ.
- Examples:
  - `components/blog-engine/WelcomeScreen.tsx:52`
  - `components/radar/WelcomeScreen.tsx:52`

### App Root Onboarding Redirects

- `app/apps/blog-engine/page.tsx` and `app/apps/radar/page.tsx` are the same server-page pattern:
  - create Supabase server client
  - require authenticated user
  - query one onboarding flag
  - redirect to dashboard if complete
  - otherwise render welcome screen
- Examples:
  - `app/apps/blog-engine/page.tsx:5`
  - `app/apps/radar/page.tsx:5`

### Dashboard Page Chrome

- Dashboards repeat a shared page frame: scroll container, centered max-width content, page heading/description, action area, card grids/lists, banners, and empty states.
- Blog Engine and Radar both include polling flows for long-running jobs/checks, but the UI contract is similar: trigger action, show busy state, poll status, refresh/update local state, show error/limit banner.
- Hyperlocal repeats reusable card/list primitives inline (`StatusCard`, `EmptyState`, section cards, list rows) that would also be useful in other dashboards.
- Examples:
  - `app/apps/blog-engine/dashboard/dashboard-client.tsx:142`
  - `components/radar/dashboard/DashboardClient.tsx:156`
  - `app/apps/hyperlocal/dashboard/dashboard-client.tsx:61`

### Upgrade Modals

- `components/blog-engine/BlogUpgradeModal.tsx` and `components/radar/RadarUpgradeModal.tsx` duplicate modal structure, close/reset behavior, selected plan state, checkout call flow, tier card layout, overlay markup, and CTA footer.
- Differences are app copy, pack source, price detail text, colors/icon, endpoint, and Blog Engine's optional limit reason copy.
- Both hand-roll overlay/dialog markup even though `components/ui/dialog.tsx` already exists.

### Settings Pages

- Radar and Blog Engine settings repeat save/saved/loading button states, subscription portal CTA state, add/remove repeated input rows, and section header patterns.
- Hyperlocal settings has a reusable tab layout that is local to one app, but the tab shell is generic enough to share.
- Examples:
  - `app/apps/blog-engine/settings/settings-client.tsx`
  - `components/radar/settings/SettingsClient.tsx`
  - `app/apps/hyperlocal/settings/settings-client.tsx`

### Onboarding Chat UIs

- Blog Engine, Radar, and Hyperlocal each implement chat-like onboarding independently: message list, auto-scroll, input handling, busy indicator, assistant/user bubbles, confirmation or draft summary, and app-colored controls.
- The backend flow differs per app, but the UI primitives are mostly shared.
- Examples:
  - `components/blog-engine/onboarding/OnboardingChat.tsx`
  - `components/radar/onboarding/OnboardingChat.tsx`
  - `components/hyperlocal/onboarding/OnboardingChat.tsx`

## Suggested Refactor Plan

### 1. Add a Shared App Shell

Create `components/app-shell/AppShell.tsx`:

- Props: `themeClassName`, `header`, `children`, `mainClassName`, `mainOverflow`.
- Replace Blog Engine, Radar, and Hyperlocal layout clients first.
- Keep Prompt Studio separate until the chat/sidebar header contract is made compatible.

This is low risk and removes near-identical layout wrappers immediately.

### 2. Extract a Config-Driven Product Header

Create `components/app-shell/ProductHeader.tsx` with:

- `homeHref`
- `navItems`
- `activeBaseHref`
- `accentClassName` or theme token
- `rightSlot`
- `mobileExtraSlot`
- `helpSlot`

Then keep app-specific wrappers thin:

- `BlogEngineHeader` supplies nav, usage badge, help modal, upgrade modal.
- `RadarHeader` supplies nav, usage badge, help modal, upgrade modal.
- `HyperlocalHeader` supplies nav only.

Also extract a single `HelpIconButton` using `lucide-react` `CircleHelp` or a shared gradient icon component instead of repeated inline SVG.

### 3. Move App Metadata Into Config

Create an `appConfigs` module for stable product metadata:

- app id
- label
- theme class
- accent color/token
- base route
- dashboard route
- settings route
- nav items
- usage endpoint/event, when applicable
- upgrade/help modal component factories, when applicable

This prevents every app from hard-coding route strings, colors, and active-route rules in multiple places.

### 4. Build Reusable Page Primitives

Add shared primitives under `components/app-shell` or `components/ui`:

- `PageFrame`
- `PageHeader`
- `PageSection`
- `MetricCard`
- `DashboardCard`
- `EmptyState`
- `InlineStatusBanner`
- `ActionButton`
- `SettingsSection`
- `SettingsTabs`

Use them first in Hyperlocal dashboard because its local `StatusCard` and `EmptyState` are straightforward. Then migrate Blog Engine/Radar dashboard headers and banners.

### 5. Generalize Welcome Screens

Create `components/app-shell/ProductWelcome.tsx`:

- `badge`
- `title`
- `description`
- `stats`
- `features`
- `cta`
- `accent`

Blog Engine and Radar become data-only wrappers. This removes almost all duplication while preserving per-product copy.

### 6. Generalize Onboarding Root Redirects

Add a server helper, for example `lib/apps/onboarding.ts`:

- `requireUserOrRedirect()`
- `redirectIfOnboarded({ table, select, userIdColumn, flagColumn, dashboardHref })`

Use it in Blog Engine and Radar root pages. Hyperlocal can use the same helper once its onboarding condition is expressed as a predicate function.

### 7. Replace Hand-Rolled Upgrade Modals

Create a shared `PlanUpgradeDialog`:

- Props for packs, selected id, best-value marker, price renderer, subscribe endpoint, header copy, info copy, accent classes, icon, optional limit copy.
- Implement on top of `components/ui/dialog.tsx` after checking whether that dialog needs dark-theme/card token updates.

Blog Engine and Radar wrappers should only provide pack data and copy.

### 8. Extract Chat Onboarding Primitives

Do not force all onboarding flows into one state machine yet. Start with presentation primitives:

- `OnboardingChatFrame`
- `ChatMessageList`
- `ChatBubble`
- `TypingIndicator`
- `ChatComposer`
- `ConfirmationCard` or generic `ReviewCard`

Then each app keeps its own transport/finalize logic but stops duplicating the chat UI.

## Recommended Order

1. `AppShell` extraction.
2. `ProductHeader` extraction plus shared help icon.
3. `ProductWelcome` extraction.
4. Shared dashboard/page primitives.
5. `PlanUpgradeDialog`.
6. Onboarding redirect helper.
7. Onboarding chat presentation primitives.

This order starts with the safest structural duplication, then moves toward more stateful surfaces where app behavior differs.
