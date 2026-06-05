# Issue 0007: Extract Onboarding Chat Presentation Primitives

Status: todo
Type: afk
Epic: 0001-shareable-layouts

## Problem

Blog Engine, Radar, and Hyperlocal onboarding chat UIs each implement message containers, auto-scroll regions, assistant/user bubbles, loading indicators, composers, and confirmation/review card patterns independently.

## Scope

- Extract presentation primitives only, such as:
  - `OnboardingChatFrame`
  - `ChatMessageList`
  - `ChatBubble`
  - `TypingIndicator`
  - `ChatComposer`
  - generic review/confirmation card pieces if they fit
- Migrate one app first, then migrate additional apps only if the API holds cleanly.
- Keep each app's backend transport, draft/finalize logic, and state machine local.

## Acceptance Criteria

- At least one onboarding chat uses shared presentation primitives.
- Extracted primitives are app-color/theme friendly.
- Existing app-specific flow behavior is preserved.
- No shared state machine is introduced.

## QA

- Run the repo's type/lint check if available.
- Manually inspect the migrated onboarding chat for:
  - message layout
  - busy state
  - composer disabled state
  - mobile sizing

## Notes

This is intentionally last because the UI is similar but the data flow differs the most.
