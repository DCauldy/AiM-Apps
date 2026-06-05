# Ralph Loop Brief

## Objective

Work through Epic 0001: Shareable Layouts using both repo-local skills:

- Work Local Issue: `.agents/skills/work-local-issue/SKILL.md`
- Vercel React Best Practices: `.agents/skills/vercel-react-best-practices/SKILL.md`

Epic path:

```text
docs/issues/epics/0001-shareable-layouts/
```

Implement the epic's todo issues in lexical order, one issue at a time, preserving app behavior while extracting shared UI/layout primitives.

## Out of Scope

- Do not redesign the apps.
- Do not merge unrelated product-specific business logic.
- Do not force Prompt Studio into the new shell.
- Do not change route semantics, subscription behavior, auth behavior, onboarding state machines, or checkout behavior except where an issue explicitly requires presentation extraction.
- Do not add new dependencies unless absolutely necessary and recorded in status.
- Do not work outside Epic 0001 unless required to satisfy the selected issue.

## Definition of Done

The loop is done when all issue files under `docs/issues/epics/0001-shareable-layouts/` have been completed according to the Work Local Issue skill:

- each issue file has `Status: done`,
- each issue file has been renamed from `*-todo-*` to `*-done-*`,
- the epic's acceptance criteria are satisfied,
- `npm run build` passes, or any unavoidable validation limitation is clearly documented.

## Validation Commands

Run when practical after each issue or substantial implementation slice:

```bash
.ralph-loop/run.sh
```

The runner executes:

```bash
npm run build
```

Do not run `npm run lint` as required validation; this repo's lint script is currently known to prompt/fail because Next lint is not configured.

## Manual Validation

When practical, inspect or smoke-test affected routes named by the active issue, especially:

- `/apps/blog-engine`
- `/apps/radar`
- `/apps/hyperlocal`

If browser/dev-server validation is not practical in the iteration, record that in `.ralph-loop/status.md`.

## Rules and Constraints

- At the start of every iteration, read `.agents/skills/work-local-issue/SKILL.md`, `.agents/skills/vercel-react-best-practices/SKILL.md`, `.ralph-loop/brief.md`, `.ralph-loop/status.md`, and the active issue file.
- Use the Work Local Issue workflow exactly for choosing, completing, and marking issues.
- Apply Vercel React Best Practices for all React/Next.js component, layout, route, and shared primitive changes.
- Work issues in lexical order by filename.
- Prefer one complete issue per iteration. If an issue is too large, complete one coherent slice and leave the issue as `todo` until all acceptance criteria are met.
- Keep shared components simple, compositional, and app-theme friendly.
- Preserve existing copy, navigation, route behavior, API calls, checkout endpoints, auth checks, and onboarding flow semantics.
- Do not hide product-specific behavior in overly generic abstractions.
- Use TypeScript and existing project style.
- Update `.ralph-loop/status.md` after every iteration with completed work, validation results, blockers, and next issue/slice.

## Stop Conditions

Emit `RALPH_DONE` when all Epic 0001 issue files are marked done and renamed to `*-done-*`, and validation has passed or limitations are documented.

Emit `RALPH_CONTINUE` when more todo issues or incomplete acceptance criteria remain.

## Failure Behavior

If validation fails:

- try to fix failures caused by the current iteration,
- if blocked or unrelated, record the exact command/output summary in `.ralph-loop/status.md`,
- do not mark the issue done unless acceptance criteria are met and the validation limitation is understood.

If the task appears ambiguous or risky, stop after updating `.ralph-loop/status.md` with the question/blocker and emit `RALPH_CONTINUE`.
