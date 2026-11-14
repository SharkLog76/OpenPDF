# Documentation ownership and authoring

Use the [documentation directory](../README.md) to locate canonical owners before
adding a new document. Preserve one canonical owner for each contract or workflow;
link to that owner instead of duplicating requirements across files.

## Choose a destination

| Document                                                 | Destination                            |
| -------------------------------------------------------- | -------------------------------------- |
| Development, testing, and authoring instructions         | `docs/development/`                    |
| Composition diagrams                                     | `docs/architecture/`                   |
| One feature specification, plan, tasks, and verification | `docs/specs/<domain>/<feature-slug>/`  |
| One architectural decision                               | `docs/adr/<domain>/<decision-slug>.md` |

## Feature lifecycle

Create the specification before writing application code. Each feature directory contains:

- `spec.md`: problem, desired behavior, contracts, resource admission, acceptance criteria, and non-goals.
- `plan.md`: implementation plan, module boundaries, and architectural choices.
- `tasks.md`: incremental, testable steps linked to requirements and verification.
- `verification.md`: executed tests, real-artifact checks, and explicit coverage limits.

Record isolated architectural decisions in `docs/adr/<domain>/<decision-slug>.md`
with **Status**, **Context**, **Decision**, and **Consequences**, and link each
ADR from its affected specifications.
