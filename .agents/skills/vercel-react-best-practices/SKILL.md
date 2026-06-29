---
name: vercel-react-best-practices
description: Apply Vercel/Next.js App Router and React best practices for maintainable UI work in this repo. Use when implementing React components, Next.js routes/layouts, shared UI primitives, server/client component boundaries, or Vercel-oriented app code.
---

# Vercel React Best Practices

Use this skill for React and Next.js App Router changes in this repo.

## Core rules

- Keep Server Components server-side by default; add `"use client"` only when hooks, browser APIs, event handlers, or client state are required.
- Do not import client-only components, hooks, or browser-dependent modules into Server Components.
- Keep Client Components as small leaf/client islands when practical.
- Preserve existing route semantics, redirects, auth checks, metadata, and cache behavior.
- Prefer composition and explicit props over large generic frameworks.
- Avoid unnecessary effects. Derive values during render when possible.
- Keep state local to the smallest component that needs it.
- Use stable keys from data IDs/slugs, not array indexes when list identity can change.
- Preserve accessibility: semantic elements, labels, focus behavior, keyboard operability, and readable contrast.
- Preserve responsive behavior and existing Tailwind design tokens/classes unless the issue asks for visual changes.
- Avoid hydration mismatches: do not render time/random/browser-specific values differently between server and client.
- Do not add dependencies for simple UI extraction.

## Shared component extraction

When extracting shared UI:

1. Start from existing repeated markup and preserve behavior exactly.
2. Keep app-specific data, copy, routes, API calls, and business logic in thin product wrappers.
3. Put only reusable presentation/frame behavior in shared components.
4. Use slots (`ReactNode`) for app-specific badges, actions, modals, and right-side content.
5. Make styling configurable with narrow props/className hooks rather than product-specific branching.
6. Keep prop names concrete and easy to read.
7. Export types when wrappers need them.

## Next.js App Router guidance

- Layout/page server files should remain server components unless there is a clear client need.
- Client layout wrappers may accept `children: React.ReactNode` and render providers/interactive chrome.
- Use `next/navigation` hooks only in client components.
- Use `redirect` and server data fetching only in server components/helpers.
- Server helpers should not import React client components or browser-only libraries.

## Validation expectations

For this repo, prefer:

```bash
npm run build
```

Lint is not required until this repo's lint script is configured.
