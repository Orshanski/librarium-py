# AGENTS.md

This file is binding for Codex and other coding agents working in this repository.
`CLAUDE.md`, `backend/CLAUDE.md`, and `frontend/CLAUDE.md` contain additional
project-specific rules; when in doubt, follow the stricter rule and ask Alexey
before taking irreversible actions.

## Project

Librarium is a personal family web library.

- Backend: FastAPI, SQLite, Python.
- Frontend: React, TypeScript, Vite.
- Data lives under `data/` and is gitignored.

## Mandatory Workflow

- Use `bd` / beads for all task tracking. Do not replace it with markdown TODOs
  or ad-hoc internal task lists.
- At session start or before taking non-trivial work, run `bd prime` and inspect
  the relevant bead. Create or update a bead when the work is not already tracked.
- Do not implement broad behavior changes without a task/spec/plan when the
  scope is unclear or cross-cutting.
- Use TDD for feature work and bug fixes: add the regression/behavior test first,
  watch it fail for the right reason, then implement.
- After every artifact that matters (spec, plan, code), run or request review
  according to the workflow in `CLAUDE.md`.
- Show review findings to Alexey. Do not silently discard findings or postpone
  them unless Alexey explicitly agrees.

## Feature Development Path

This is the canonical path for product features, behavioral fixes, and
non-trivial refactors. It mirrors the mandatory process in `CLAUDE.md`; do not
compress or reorder it without Alexey's explicit approval.

0. **Task.** Run `bd prime`, find or create the bead, read its context, and
   claim/update it before implementation.
1. **Spec.** Write the design document in
   `project_documentation/specs/YYYY-MM-DD-<topic>-design.md`. This directory
   is gitignored and must not be committed.
2. **Spec review.** Run reviewer, then show Alexey all findings.
3. **Spec fixes.** Fix findings and get Alexey's approval.
4. **Plan.** Use `superpowers:writing-plans` to write a detailed staged TDD plan
   in `project_documentation/plans/YYYY-MM-DD-<topic>.md`. This directory is
   gitignored and must not be committed.
5. **Plan review.** Run reviewer, then show Alexey all findings.
6. **Plan fixes.** Fix findings and get Alexey's approval.
7. **Branch.** Create a feature branch or worktree from `main`. Do not work on
   `main`.
8. **Tests.** Write tests before implementation.
9. **Implementation.** Implement the code and run the relevant tests.
10. **Manual testing.** Alexey checks the behavior manually. Wait for the result.
11. **Commit.** Commit only after Alexey's approval.
12. **Spec review of code.** After each atomic code commit, run review for code
   compliance with the spec and show Alexey all findings.
13. **Code review.** After each atomic code commit, run code-quality review and
   show Alexey all findings. Before merge, run a final branch-wide review sweep.
14. **Review fixes.** Fix every review finding in the same task unless Alexey
   explicitly decides otherwise. Fix commits also go through review.
15. **Bead update.** Close or update the bead with the actual result and
   verification evidence.
16. **Merge.** Merge only when Alexey explicitly says to merge.
17. **Push.** Push only when Alexey explicitly says to push. Merge permission is
   not push permission.

## Branches, Commits, Pushes

- Never develop or commit directly on `main` unless Alexey explicitly says to do
  so for this exact task.
- Before editing or committing, check the current branch. If it is `main`, create
  or switch to a task branch/worktree first.
- Preserve user changes in the worktree. Do not revert, reset, overwrite, or
  clean files you did not intentionally change.
- Commit only after the requested work and its verification are complete, or when
  Alexey explicitly asks for an intermediate commit.
- Merge only on an explicit command from Alexey.
- Push only on an explicit command from Alexey.
- Do not push non-business changes by themselves. Process/docs/tooling-only
  changes such as `AGENTS.md`, `CLAUDE.md`, harness scripts, hooks, or local
  workflow conventions should stay local until they travel with the next real
  feature/fix merge, unless Alexey explicitly asks to push them.

## Verification

- Do not claim that something is fixed, complete, or safe until the relevant
  verification has run.
- Run targeted tests for touched behavior. Run broader tests/builds when the
  change affects shared contracts, cache behavior, routing, persistence, or user
  workflows.
- Backend pytest must run sequentially. Do not run backend test commands in
  parallel.
- Frontend and backend test runs should also be kept sequential unless Alexey
  explicitly asks otherwise.
- Do not run a full baseline suite before starting work unless there is a
  concrete reason to suspect `main` is already broken.
- Report the exact verification commands and results in the final answer.

## Communication

- If Alexey says something is broken, verify before arguing.
- Keep updates short and concrete: what changed, what was verified, what remains.
- Ask before irreversible actions, scope changes, merges, and pushes.
