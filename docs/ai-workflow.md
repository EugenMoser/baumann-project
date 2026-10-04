# AI-assisted workflow

How this project is planned, built and reviewed with AI agents — and what stays
a human decision.

## Roles

| Step           | Human                                            | AI                                                                                             |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Roadmap        | Sets goals, scope, priorities; approves (Gate 0) | Decomposes, estimates, lists risks                                                             |
| Spec           | Answers questions, approves (Gate 1)             | Asks one question at a time, proposes approaches, writes the spec with FR/SC IDs               |
| Plan           | Approves (feature 1 only)                        | Writes a task-by-task plan with tests                                                          |
| Implementation | —                                                | Test-writer writes failing tests; implementer makes them pass; WIP commits on a feature branch |
| Review         | Final review, merge decision (Gate 2)            | Code-reviewer and security-reviewer agents                                                     |

## Flow

Roadmap → spec → plan → TDD → review → PR → merge.

## Artifacts

| Artifact            | Location                               |
| ------------------- | -------------------------------------- |
| Roadmap             | `docs/roadmap.md`                      |
| Data model          | `docs/data-model.md`                   |
| Specs               | `docs/specs/`                          |
| Plans               | `docs/plans/`                          |
| Decisions           | `docs/decisions/`                      |
| Agent configuration | `CLAUDE.md`, `.claude/`                |
| Review results      | Pull request descriptions and comments |

## Guardrails

- Pre-commit: gitleaks, lint-staged, typecheck, tests.
- CI on every PR and on pushes to `main`.
- Agents make WIP commits on feature branches; push, merge and commits to `main` require human approval.
