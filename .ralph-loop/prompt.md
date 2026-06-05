# Ralph Loop Iteration Prompt

You are inside a Ralph loop. Perform exactly one useful iteration toward the objective in `.ralph-loop/brief.md`.

## Required Reading

1. `.agents/skills/work-local-issue/SKILL.md`
2. `.agents/skills/vercel-react-best-practices/SKILL.md`
3. `.ralph-loop/brief.md`
4. `.ralph-loop/status.md`
5. `docs/issues/epics/0001-shareable-layouts/0000-epic.md`
6. The first lexical `*-todo-*.md` issue file in `docs/issues/epics/0001-shareable-layouts/`

## Per-Iteration Rules

1. Use the Work Local Issue skill to choose and execute the active issue.
2. Use the Vercel React Best Practices skill for all React/Next.js implementation decisions.
3. Choose the first lexical todo issue unless status indicates an in-progress slice should continue.
4. Prefer completing exactly one issue per iteration; if too large, complete one coherent slice.
5. Make only changes needed for the selected issue/slice.
6. Preserve existing behavior, copy, routes, auth, subscription, onboarding, and checkout semantics.
7. Validate with `.ralph-loop/run.sh` whenever practical.
8. If the selected issue is fully complete, change `Status: todo` to `Status: done` and rename its file from `*-todo-*` to `*-done-*`.
9. Update `.ralph-loop/status.md` with work completed, validation results, blockers, and next step.
10. If definition of done is met, end with a final line exactly `RALPH_DONE`.
11. Otherwise end with a final line exactly `RALPH_CONTINUE`.

## Validation

Run:

```bash
.ralph-loop/run.sh
```

This runs `npm run build`.

Do not require `npm run lint`; lint is currently not configured in this repo.

## Extra Rules

- Keep Server Components server-side by default.
- Add `"use client"` only where required.
- Keep product wrappers thin and shared components compositional.
- Prefer slots over shared components importing product business logic.
- Do not add dependencies unless necessary and documented.
- Do not mark an issue done if blocked or validation reveals unresolved current-iteration failures.
