---
name: epic-kickoff
description: Kick off a local Markdown epic by turning an epic overview into approved story files. Use when the user asks to start, kick off, plan, break down, or create issues for an epic under docs/issues/epics.
---

# Epic Kickoff

Use this skill to start a planning-container epic from `docs/issues/epics/<epic>/0000-epic.md` and create ready-to-work story files only after user approval.

## Rules

- Do not implement code during epic kickoff.
- Do not create story files until the user approves the proposed breakdown.
- If story files already exist, read them and ask whether to refine existing stories or add new ones.
- Keep stories as thin vertical slices that are independently demoable.
- Prefer `todo-afk` only when an agent can implement the story without more product/design discussion.
- Use `todo-hitl` when a story requires human review, design/product decisions, or client wording before it can be completed.
- Preserve local tracker conventions: `NNNN-status-type-slug.md` under the epic directory.

## Workflow

1. Identify the epic directory from the user's request. If unspecified, ask which epic.
2. Read the epic's `0000-epic.md`.
3. Read referenced PRD, architecture docs, ADRs, or context docs that materially affect the epic.
4. Inspect existing story files in the epic directory.
5. Summarize the epic assumptions back to the user:
   - product/domain intent
   - in-scope behavior
   - out-of-scope behavior
   - key dependencies
   - likely test boundaries
6. Ask whether there are any special instructions before story creation. Keep this concise and explicit.
7. After the user answers, propose a numbered story breakdown. For each story include:
   - title
   - type: `AFK` or `HITL`
   - blocked by
   - end-to-end value shipped
   - acceptance criteria summary
8. Ask the user to confirm:
   - granularity
   - dependencies
   - AFK/HITL labels
   - anything to merge/split/remove
9. After approval, create story files in dependency order using `apply_patch`.

## Story File Template

```md
# Story Title

## What to build

Describe the end-to-end behavior this story delivers. Avoid implementation-only horizontal slices.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- `NNNN-todo-afk-some-prerequisite.md`
```

Use `None - can start immediately.` when there is no blocker.

## Completion

After creating story files, report the files created and state that the epic is now ready for `work-local-issue` execution.
