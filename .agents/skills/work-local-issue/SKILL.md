---
name: work-local-issue
description: Work through this repo's markdown issue tracker under docs/issues, selecting todo issue files, implementing them, validating, and marking completion by renaming files and updating status. Use when asked to work local issues, local issue tracker, repo issues, epics, todo-afk files, or Ralph-loop issue execution.
---

# Work Local Issue

Use this skill to execute this repo's local markdown issue tracker.

## Tracker conventions

- Epics live under `docs/issues/epics/<epic-id>-<slug>/`.
- Epic overview file is usually `0000-epic.md`.
- Todo issue files are named like `0001-todo-afk-some-work.md`.
- Some epic directories are backlog/planning containers with only `0000-epic.md`. These are not ready-to-work issues.
- When starting a backlog/planning epic, discuss the epic with the user first, then create vertical story files in that epic directory after the user approves the breakdown.
- Completed issue files should be renamed from `*-todo-afk-*.md` to `*-done-*.md`.
- The issue file front matter/body status line should change from `Status: todo` to `Status: done`.
- Preserve issue number, slug, type, and epic directory.

Example completion rename:

```text
docs/issues/epics/0001-shareable-layouts/0001-todo-afk-extract-app-shell.md
→ docs/issues/epics/0001-shareable-layouts/0001-done-afk-extract-app-shell.md
```

## Workflow

1. Identify the active epic directory and read `0000-epic.md`.
2. List issue files in lexical order.
3. If the epic has no `NNNN-<status>-<type>-<slug>.md` story files:
   - treat it as a backlog/planning epic,
   - do not implement code yet,
   - discuss scope, dependencies, acceptance criteria, and testing expectations with the user,
   - create story files only after the user approves the breakdown.
4. Pick the first `*-todo-*.md` issue unless the Ralph brief says otherwise.
5. Read the selected issue fully.
6. Implement only that issue's scope and acceptance criteria.
7. Avoid unrelated redesigns, route changes, dependency changes, or product behavior changes.
8. Validate using the commands in the issue, Ralph brief, or `.ralph-loop/run.sh`.
9. If the issue acceptance criteria are met:
   - edit `Status: todo` to `Status: done` in the issue file
   - rename the file from `*-todo-*` to `*-done-*`
10. Update `.ralph-loop/status.md` if running in a Ralph loop.
11. Stop after one useful iteration; do not continue into the next issue unless explicitly instructed.

## Epic kickoff rules

When the user asks to start, plan, or break down an epic:

- Read that epic's `0000-epic.md` and any referenced PRD/architecture docs.
- Ask targeted questions if decisions are still missing; otherwise propose vertical stories.
- Stories should be thin tracer bullets that are independently demoable.
- Prefer `todo-afk` story files only after scope is settled enough for an agent to implement without more product discussion.
- Use `todo-hitl` when the story itself requires human design/product review before implementation can finish.
- Do not mark backlog epic directories as complete just because story files were created.

## Completion rules

Mark an issue done only when:

- implementation matches the issue scope,
- validation was run or a clear reason is recorded,
- no known regression remains,
- the issue file status and filename both indicate done.

If blocked, do not rename the issue. Record the blocker and leave status as `todo`.

## Recommended commands

```bash
npm run build
```

Do not rely on `npm run lint` in this repo unless lint setup has been fixed; currently it is known to prompt/fail because Next lint is not configured.
